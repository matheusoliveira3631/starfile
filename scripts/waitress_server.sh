#!/bin/bash
cd /home/ubuntu/starfile/
source environment/bin/activate
waitress-serve --port=80 --call app:create_app