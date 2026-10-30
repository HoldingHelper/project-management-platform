"""Destructive routes must not be available through REST or MCP API delegation."""
from app.modules.docs.router import docs_router
from app.modules.chat.router import chat_router
from app.modules.collaboration.router import files_router

def test_destructive_routes_are_removed():
    routes = [(route.path, route.methods) for router in (docs_router, chat_router, files_router) for route in router.routes]
    forbidden = {"/docs/pages/{page_id}", "/docs/sources/{source_id}", "/chat/messages/{message_id}", "/files/{attachment_id}"}
    for path, methods in routes:
        assert not (path in forbidden and "DELETE" in methods)
        assert not path.endswith("/delete-permission")
        assert not path.endswith("/unpublish")
