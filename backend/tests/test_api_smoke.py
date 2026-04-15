from api import app


def test_health_endpoint_returns_json():
    client = app.test_client()
    response = client.get('/api/health')

    assert response.status_code in (200, 500)
    assert response.is_json


def test_convert_requires_code_payload():
    client = app.test_client()
    response = client.post('/convert', json={'mode': 'java2py'})

    assert response.status_code == 400
    data = response.get_json()
    assert data['status'] == 'error'


def test_migrate_requires_code_payload():
    client = app.test_client()
    response = client.post('/migrate', json={})

    assert response.status_code == 400
    data = response.get_json()
    assert data['status'] == 'error'


def test_convert_rejects_invalid_mode():
    client = app.test_client()
    response = client.post('/convert', json={'code': 'print(1)', 'mode': 'invalid'})

    assert response.status_code == 400
    data = response.get_json()
    assert data['status'] == 'error'
