import os

from flask import Response

def authenticate(request):
    if request.json['password']==os.environ['SECRET_TOKEN']:
        return Response(status=200)
    else:
        return Response(status=403)