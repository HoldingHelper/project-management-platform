import logging

from app.core.logging import AccessTokenFilter


def test_uvicorn_websocket_handshake_redacts_formatted_token():
    record = logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1,
                               'WebSocket %s [accepted]',
                               ('/ws?access_token=private-token&other=ok',), None)
    assert AccessTokenFilter().filter(record)
    assert "private-token" not in record.getMessage()
    assert "other=ok" in record.getMessage()
