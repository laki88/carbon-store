/*
 Description: Handles the logic related to deployment of assets.
 Filename: asset.deployment.js
 Created Date:13/8/2013
 */
var deployment_logic = function () {

    var utility = require('/modules/utility.js').rxt_utility();
    var bundler = require('/modules/bundler.js').bundle_logic();
    var log = new Log();
    var INSTALL_SCRIPT_NAME='install.js';
    var INSTALLER_MODULE_NAME='installer';

    /*
     Deploys the assets in a provided path
     */
    function Deployer(options) {
        this.config = null;
        utility.config(options, this);
        this.bundleManager = null;
        this.handlers = {};
    }

    /*
     Loads the bundle manager
     */
    Deployer.prototype.init = function () {
        log.info('initializing bundle manager for ' + this.config.root);

        this.bundleManager = new bundler.BundleManager({
            path: this.config.root
        });

        log.info('finished initializing bundle manager');

    };

    /*
     The function allows a third party handler to be registered for
     a given asset type
     */
    Deployer.prototype.register = function (assetType, handler) {
        this.handlers[assetType] = handler;
    };

    /*
     The function is responsible for invoking the logic for a given a asset typ
     @assetType: The assettype to be invoked
     @bundle: The bundle containing information on the asset
     */
    Deployer.prototype.invoke = function (assetType, bundle) {

        //Check if a handler is present
        if(this.handlers.hasOwnProperty((assetType))){
            var basePath= this.bundleManager.path+'/'+assetType;

            //Check if an install script can be found within the bundle
            var script=getInstallScript(bundle,basePath);

            var scriptObject=this.handlers[assetType];

            var modifiedScriptObject=scriptObject;

            //Only override if there is a script
            if(script){
                //Obtain a script object with overriden functions if one is present
                modifiedScriptObject=scriptObject.override(script);
            }
            var context={};
            context['bundle']=bundle;
            //Invoke the logic
            modifiedScriptObject.invoke('onCreate',[context]);

            return;
        }

        /*if (this.handlers.hasOwnProperty(assetType)) {
            this.handlers[assetType](bundle, {currentPath: this.config.root + '/' + assetType + '/' + bundle.getName(), type: assetType});
        }*/

        log.info('no handler specified for deploying : ' + assetType);
    };

    Deployer.prototype.autoDeploy = function () {
        var that = this;
        log.info('starting auto deploying assets in ' + this.config.root);
        this.bundleManager.getRoot().each(function (asset) {
            log.info('auto deployment of ' + asset.getName());
            that.deploy(asset.getName());
        })
    }

    /*
     The function deploys a provided asset type by invoking the handlers
     @assetType: The asset type to be deployed
     */
    Deployer.prototype.deploy = function (assetType) {

        //Locate the configuration information for the asset type
        var assetConfiguration = findConfig(this.config, assetType);

        //Check if a configuration block exists for the
        //provided asset type
        if (!assetConfiguration) {
            log.info('could not deploy ' + assetType + ' as configuration information was not found.');
            return;
        }

        //Check if the asset type has been ignored
        if (isIgnored(this.config, assetType)) {
            log.info('asset type : ' + assetType + ' is ignored.');
            return;
        }

        //Obtain the bundle for the asset type
        var rootBundle = this.bundleManager.get({name: assetType});

        //A root bundle exists for the asset type (e.g. gadgets folder)
        if (rootBundle) {

            var that = this;

            log.info('[' + assetType.toUpperCase() + '] been deployed.');
            var basePath= this.bundleManager.path;

            //Check if there is a root level install script specified
            var script=getInstallScript(rootBundle,basePath);

            //Check if a script is present
            if(script){
                var scriptObject=new ScriptObject(script);
                this.handlers[assetType]=scriptObject;
            }

            //Deploy each bundle
            rootBundle.each(function (bundle) {

                log.info('deploying ' + assetType + ' : ' + bundle.getName());

                //Check if the bundle is a directory
                if(!bundle.isDirectory()){
                    log.info('ignoring bundle: '+bundle.getName()+' not a deployable target');
                    return;
                }

                if (isIgnored(assetConfiguration, bundle.getName())) {
                    log.info('ignoring ' + assetType + " : " + bundle.getName() + '. Please change configuration file to enable.');
                    return;
                }
                that.invoke(assetType, bundle);

                log.info('finished deploying ' + assetType + ' : ' + bundle.getName());

            });

            log.info('[' + assetType.toUpperCase() + '] ending deployment');
        }
        else {
            log.info('could not deploy asset ' + assetType + ' since a bundle was not found.');
        }

    };


    /*
     The function locates the configuration information on a per asset basis
     */
    function findConfig(masterConfig, assetType) {
        var assetData = masterConfig.assetData || [];
        var asset;

        //Locate the asset type
        for (var index in assetData) {

            asset = assetData[index];

            if (asset.type == assetType) {
                return asset;
            }
        }

        return null;
    }

    /*
     The function checks whether the provided target should be ignored
     based on the presence of an ignore array
     @config: An object containing an ignore property
     @target: The string which will be checked
     */
    function isIgnored(config, target) {
        var ignored = config.ignore || [];

        if (ignored.indexOf(target) != -1) {
            return true;
        }

        return false;
    }

    /*
    The function locates an install script  within a given bundle
    @bundle:The bundle within which the install script must be located
    @return:An object containing the install script (imported using require)
     */
    function getInstallScript(bundle,rootLocation){
        var bundleLocation=bundle.getName();
        var script=bundle.get({name:INSTALL_SCRIPT_NAME}).result();
        var scriptInstance;
        var scriptPath;

        if(script){
            scriptPath=rootLocation+'/'+bundleLocation+'/'+script.getName();
            log.info('script found : '+scriptPath);
            scriptInstance=require(scriptPath);
        }

        return scriptInstance;
    }

    /*
    The class is used to encapsulates script logic
    in an invokable form
     */
    function ScriptObject(scriptInstance){
        this.functionObject={};

        if(scriptInstance){
            this.init(scriptInstance);
        }

    }

    /*
    The method creates a functionObject using the script instance
     */
    ScriptObject.prototype.init=function(scriptInstance){
        var functionInstance;
        var logicObject={};
        //Check if the module we need is present
        if(scriptInstance.hasOwnProperty(INSTALLER_MODULE_NAME)){

            log.info('installer module found.');

            logicObject=scriptInstance[INSTALLER_MODULE_NAME]();

            //Go through each exposed method
            for(var index in logicObject){

                functionInstance=logicObject[index];

                this.functionObject[index]=functionInstance;
            }
        }
    };

    /*
    The function invokes a provided method with the given parameters
     */
    ScriptObject.prototype.invoke=function(methodName,arguments){
        if(this.functionObject.hasOwnProperty(methodName)){
             log.info('invoking method: '+methodName);
             log.info(this.functionObject);
             this.functionObject[methodName].apply(this.functionObject,arguments);
            return;
        }
        log.info('unable to invoke '+methodName);
    };

    /*
    The function is used to create a new ScriptObject with
    the provided script.Any matching functions are overridden
    @scriptInstance:A script containing overridding logic
    @return: A new ScriptObject with methods given in the scriptInstance
            used to override the base methods
     */
    ScriptObject.prototype.override=function(scriptInstance){

        //Create a copy of the current object
        var cloned=clone(this.functionObject);
        var logicObject;

        if(scriptInstance.hasOwnProperty(INSTALLER_MODULE_NAME)){
           logicObject=scriptInstance[INSTALLER_MODULE_NAME]();
           log.info('clone: '+stringify(cloned));

            //Go through each property in the logic object
            for(var index in logicObject){
                log.info('overriding '+index);

                //Check if the clone has the property before attempting
                //to replace
                if(cloned.hasOwnProperty(index)){
                    cloned[index]=logicObject[index];
                }
            }

        }

        //Create a new script object which will host the clone
        var scriptObject=new ScriptObject();
        scriptObject.functionObject=cloned;

        return scriptObject;
    };

    /*
    The function creates a clone of the provided object
     */
    function clone(object){
       var cloned={};
       //Go through each property
        for(var index in object){
            cloned[index]=object[index];
        }

        return cloned;
    }

    return{
        Deployer: Deployer
    }
};
