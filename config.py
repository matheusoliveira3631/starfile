import os

class Config(object):
    pass

class devConfig(Config):
    def __init__(self, app):
        self.app=app

    @property
    def UPLOAD_FOLDER(self):
        return os.path.join(self.app.root_path, 'userUploads') 
    ENV = 'development'
    DEBUG = True
    
class productionConfig(Config):
    ENV= 'production'
    DEBUG= False
    