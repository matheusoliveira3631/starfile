from flask import Blueprint
from flask.globals import request


from .controllers import homepage
from .controllers import fileDownload
from .controllers import file_register

app = Blueprint('app', __name__)

@app.route('/')
def home():
    return homepage()

@app.route('/file/<string:filename>')
def download(filename):
    return fileDownload(filename)

@app.route('/file/register/<string:filename>', methods=['POST'])
def fileRegister(filename):
    return file_register(filename)