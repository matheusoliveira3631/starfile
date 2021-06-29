class Config(object):
    pass

class devConfig(Config):
    def __init__(self, app):
        self.app=app

    @property
    def UPLOAD_FOLDER(self):
        return self.app.root_path 
    ENV = 'development'
    DEBUG = True
    
class productionConfig(Config):
    ENV= 'production'
    DEBUG= False
    