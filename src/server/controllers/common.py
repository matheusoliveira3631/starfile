import os

import boto3
from flask import render_template
from flask import jsonify

def homepage():
    return render_template('homepage.html')

def gallery():
    return render_template('gallery.html')