import os

from flask import Flask

from src import app
from config import devConfig

TEMPLATES_FOLDER=os.path.join(os.getcwd(), 'src', 'server', 'templates')
STATICS_FOLDER=os.path.join(os.getcwd(), 'src', 'server', 'static')

api = Flask(__name__, template_folder=TEMPLATES_FOLDER, static_folder=STATICS_FOLDER, static_url_path='/assets')
api.register_blueprint(app)
api.config.from_object(devConfig(api))

api.run()
