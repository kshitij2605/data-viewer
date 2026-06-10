"""LDAP / Active Directory authentication.

Performs a two-step bind: first as the configured service account to look up
the target user's DN, then a second bind as that user with their submitted
password. Returns a dict of LDAP attributes on success or None on failure.
"""
from __future__ import annotations

import logging
import ssl
from typing import Optional

from ldap3 import Server, Connection, NONE, Tls, SUBTREE
from ldap3.core.exceptions import LDAPException

from backend.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton — built once per process, reused across all logins.
# Avoids repeated DNS resolution and eliminates the get_info=ALL schema fetch
# that was adding ~500 ms to every login.
_ldap_server: Optional[Server] = None


def _get_server() -> Optional[Server]:
    global _ldap_server
    if _ldap_server is not None:
        return _ldap_server
    if not settings.ldap_url:
        return None
    tls = None
    if settings.ldap_starttls or settings.ldap_url.startswith("ldaps://"):
        validate = ssl.CERT_NONE if not settings.ldap_tls_reject_unauthorized else ssl.CERT_REQUIRED
        tls = Tls(validate=validate)
    # get_info=NONE: skip the LDAP schema/DSE fetch — we don't need it for auth.
    # connect_timeout=5: fail fast if the DC is unreachable instead of hanging.
    _ldap_server = Server(settings.ldap_url, get_info=NONE, tls=tls, connect_timeout=5)
    return _ldap_server


def authenticate(username: str, password: str) -> Optional[dict]:
    """Authenticate a user against LDAP.

    Returns a dict with keys {username, display_name, dn, mail} on success,
    or None if LDAP is not configured / credentials are invalid.
    """
    if not settings.ldap_url or not settings.ldap_user_search_base:
        return None
    if not username or not password:
        return None

    server = _get_server()
    if server is None:
        return None

    search_filter = settings.ldap_search_filter.replace("{{username}}", _escape_filter(username))

    try:
        service_conn = Connection(
            server,
            user=settings.ldap_bind_dn or None,
            password=settings.ldap_bind_credentials or None,
            auto_bind=True,
            receive_timeout=10,
        )
        if settings.ldap_starttls:
            service_conn.start_tls()
    except LDAPException as e:
        logger.warning("LDAP service bind failed: %s", e)
        return None

    try:
        ok = service_conn.search(
            search_base=settings.ldap_user_search_base,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["cn", "displayName", "mail", "sAMAccountName", "userPrincipalName"],
        )
        if not ok or not service_conn.entries:
            logger.info("LDAP search returned no entries for %s", username)
            return None
        entry = service_conn.entries[0]
        user_dn = entry.entry_dn
        attrs = {a: entry[a].value for a in entry.entry_attributes}
    except LDAPException as e:
        logger.warning("LDAP search failed for %s: %s", username, e)
        return None
    finally:
        try:
            service_conn.unbind()
        except Exception:
            pass

    try:
        user_conn = Connection(server, user=user_dn, password=password, auto_bind=True, receive_timeout=10)
        if settings.ldap_starttls:
            user_conn.start_tls()
        user_conn.unbind()
    except LDAPException as e:
        logger.info("LDAP user bind failed for %s: %s", username, e)
        return None

    display_name = attrs.get("displayName") or attrs.get("cn") or username
    sam = attrs.get("sAMAccountName") or username
    mail = attrs.get("mail") or ""
    return {
        "username": sam if settings.ldap_login_uses_username else (attrs.get("userPrincipalName") or sam),
        "display_name": display_name,
        "dn": user_dn,
        "mail": mail,
    }


def _escape_filter(value: str) -> str:
    """Escape LDAP filter special characters per RFC 4515."""
    out = []
    for ch in value:
        if ch == "\\":
            out.append("\\5c")
        elif ch == "*":
            out.append("\\2a")
        elif ch == "(":
            out.append("\\28")
        elif ch == ")":
            out.append("\\29")
        elif ch == "\x00":
            out.append("\\00")
        else:
            out.append(ch)
    return "".join(out)
