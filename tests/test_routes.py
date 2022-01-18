import os
import tempfile
import random, string
from urllib import response

import flask

import pytest

from app import create_app

def test_register():
    flask_app=create_app()
    test_string=''.join(random.choice(string.ascii_lowercase) for i in range(10))+'.txt'
    
    with flask_app.test_client() as tclient:
        res=tclient.post(f'/register/{test_string}')
        assert len(res.data)==10


