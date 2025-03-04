import sys
import os
import time
import logging
from threading import Thread
from flask import Flask, request
from config import productionConfig, devConfig
from src import app

TEMPLATES_FOLDER = os.path.join(os.getcwd(), 'src', 'server', 'templates')
STATICS_FOLDER = os.path.join(os.getcwd(), 'src', 'server', 'static')

def create_app():
    api = Flask(__name__, template_folder=TEMPLATES_FOLDER, static_folder=STATICS_FOLDER, static_url_path='/assets')
    
    # Set up logging
    logging.basicConfig(
        level=logging.DEBUG,  # Adjust the level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),  # Log to standard output (console)
            logging.FileHandler('app.log', mode='a')  # Log to a file
        ]
    )

    # Log every incoming request
    @api.before_request
    def log_request():
        # Log the incoming request details
        logging.info(f"Incoming request: {request.method} {request.path} from {request.remote_addr} with headers {dict(request.headers)}")

    # Register Blueprint and config
    api.register_blueprint(app)
    api.config.from_object(productionConfig(api))
    return api

if __name__ == "__main__":
    app = create_app()
    app.config.from_object(devConfig(app))
    
    # Log when the app starts
    logging.info("Starting Flask app on 127.0.0.1:5000")
    
    app.run(host='127.0.0.1', port=5000)
