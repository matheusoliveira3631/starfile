import os

import boto3
from flask import render_template
from flask import jsonify
from flask import current_app

def homepage():
    return render_template('homepage.html')

def gallery():
    galFolder=current_app.config['GALLERY_FOLDER']
    files=os.listdir(galFolder)
    return render_template('gallery.html', images=files)