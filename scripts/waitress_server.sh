#!/bin/bash
cd /home/ubuntu/starfile/
source venv/bin/activate
waitress-serve --port=8081 --call app:create_app 
