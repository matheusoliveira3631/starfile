import os

from flask import Flask

from src import app
from config import devConfig, productionConfig

TEMPLATES_FOLDER=os.path.join(os.getcwd(), 'src', 'server', 'templates')
STATICS_FOLDER=os.path.join(os.getcwd(), 'src', 'server', 'static')

def create_app():
    api = Flask(__name__, template_folder=TEMPLATES_FOLDER, static_folder=STATICS_FOLDER, static_url_path='/assets')
    api.register_blueprint(app)
    api.config.from_object(productionConfig(api))

    return api


if __name__=="__main__":
    app=create_app()
    app.config.from_object(devConfig)
    app.run(host='127.0.0.1', port=5000)