define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "c9", "settings", "ui", "menus", "ace", 
        "ace.gotoline", "tabManager"
    ];
    main.provides = ["ace.status"];
    return main;

    function main(options, imports, register) {
        var c9        = imports.c9;
        var Plugin    = imports.Plugin;
        var settings  = imports.settings;
        var ui        = imports.ui;
        var tabs      = imports.tabManager;
        var menus     = imports.menus;
        var gotoline  = imports["ace.gotoline"];
        var aceHandle = imports.ace;
        
        var skin    = require("text!./skin.xml");
        var markup  = require("text!./statusbar.xml");
        var menuAml = require("text!./menu.xml");
        
        var aceWhitespace = require("ace/ext/whitespace");
        var lang = require("ace/lib/lang");
        
        /***** Generic Load *****/
        
        // Set up the generic handle
        var deps       = main.consumes.slice(0, main.consumes.length - 1);
        var handle     = new Plugin("Ajax.org", deps);
        var handleEmit = handle.getEmitter();
        
        var statusbars = {};
        var menuItem, menu, menuTabs;
        
        handle.on("load", function(){
            settings.on("read", function(e){
                settings.setDefaults("user/ace/statusbar", [["show", "true"]]);
                
                if (settings.getBool("user/ace/statusbar/@show"))
                    handleEmit("show");
            }, handle);
            
            menuItem = new apf.item({
                test : "1",
                type : "check",
                checked : "[{settings.model}::user/ace/statusbar/@show]"
                // -> if you're looking for disabled, check the init function :-)
                // the moment that someone clicks this thing well call preinit 
                // (its already called if the user has it checked on IDE load)
            });
            
            menus.addItemByPath("View/Status Bar", menuItem, 600, handle);
            
            aceHandle.on("create", function(e){
                if (e.editor.type != "ace")
                    return;
                
                var editor = e.editor;
                var statusbar;
                
                editor.on("draw", function(){
                    statusbar = new Statusbar(editor);
                }, editor);
                editor.on("unload", function h2(){
                    if (statusbar) statusbar.unload();
                }, editor);
            });
            
            ui.insertMarkup(null, menuAml, handle);
            
            menu     = handle.getElement("menu");
            menuTabs = handle.getElement("menuTabs");
            
            var currentSession;
            function setCurrentSession(menu){
                var node = menu.opener;
                while (node && node.localName != "tab")
                    node = node.parentNode;
                if (!node) return;
                
                var tab = node.cloud9pane.getTab();
                currentSession = tab.document.getSession();
            }
            
            function setOption(name, value){
                if (currentSession) {
                    currentSession.session.setOption(name, value);
                    currentSession.statusBar.update();
                }
            }
            
            function getOption(name){
                return currentSession && currentSession.session.getOption(name);
            }
            
            // Checkboxes
            menu.on("afterrender", function(e){
                var itmSbWrap   = window.itmSbWrap;
                var itmSbWrapVP = window.itmSbWrapVP;
                
                itmSbWrap.on("click", function(){
                    setOption("wrap", itmSbWrap.checked
                        ? itmSbWrapVP.checked || "printMargin"
                        : false);
                });
                itmSbWrapVP.on("click", function(){
                    setOption("wrap", itmSbWrap.checked
                        ? itmSbWrapVP.checked || "printMargin"
                        : false);
                });
                
                function update(e){
                    if (!e || e.value){
                        setCurrentSession(menu);
                        
                        var wrap = getOption("wrap");
                        itmSbWrap.setAttribute("checked", !ui.isFalse(wrap));
                        itmSbWrapVP.setAttribute("checked", wrap != "printMargin");
                    }
                }
                
                menu.on("prop.visible", update);
                update();
            });
            
            // Menu Tab functionality
            var handlers = [
                function(){ setOption("useSoftTabs", this.checked) },
                function(){},
                function(){ setOption("tabSize", 2) },
                function(){ setOption("tabSize", 3) },
                function(){ setOption("tabSize", 4) },
                function(){ setOption("tabSize", 8) },
                function(){
                    var tab = tabs.focussedTab;
                    if (!tab) return;
                    var session = tab.document.getSession();
                    aceWhitespace.detectIndentation(session.session);
                    var useSoftTabs = session.session.getOption("useSoftTabs");
                    var tabSize     = session.session.getOption("tabSize");
                    menuTabs.childNodes[0].setAttribute("checked", useSoftTabs);
                    if (tabSize < 9)
                        menuTabs.childNodes[tabSize + 1].setAttribute("selected", true);
                    session.statusBar.update();
                },
                // Tabs to Spaces
                function(){
                    var tab = tabs.focussedTab;
                    if (!tab) return;
                    var session = tab.document.getSession();
                    aceWhitespace.convertIndentation(session.session, " ");
                    session.statusBar.update();
                },
                // Spaces to Tabs
                function(){
                    var tab = tabs.focussedTab;
                    if (!tab) return;
                    var session = tab.document.getSession();
                    aceWhitespace.convertIndentation(session.session, "\t");
                    session.statusBar.update();
                }
            ];
            
            menuTabs.on("afterrender", function(e){
                var items = menuTabs.selectNodes("a:item");
                items.forEach(function(node, idx){
                    node.on("click", handlers[idx]);
                });
                
                var itmTabSize  = window.itmTabSize;
                itmTabSize.on("afterchange", function(){
                    setOption("tabSize", this.value);
                    update();
                });
                
                var lut = [0,0,2,3,4,0,0,0,5];
                
                function update(e){
                    if (e && !e.value)
                        return;
                    
                    setCurrentSession(menuTabs);
                    
                    items[0].setAttribute("checked", getOption("useSoftTabs"));
                    
                    var tabSize = getOption("tabSize") || 1;
                    items.forEach(function(node, idx){
                        node.setAttribute("selected", "false");
                    });
                    if (lut[tabSize])
                        items[lut[tabSize]].setAttribute("selected", "true");
                    itmTabSize.setAttribute("value", getOption("tabSize"));
                }
                
                menuTabs.on("prop.visible", update);
                update();
            });
        });
        
        /***** Methods *****/
        
        var drawn = false;
        function draw(){
            if (drawn) return;
            drawn = true;
            
            // Import Skin
            ui.insertSkin({
                name         : "c9statusbar",
                data         : skin,
                "media-path" : options.staticPrefix + "/images/",
                "icon-path"  : options.staticPrefix + "/icons/"
            }, handle);
        };
        
        function getStatusbar(editor){
            return statusbars[editor.name];
        }
        
        function show(){
            settings.set("user/ace/statusbar/@show", "true");
        }
        
        function hide(){
            settings.set("user/ace/statusbar/@show", "false");
        }
        
        /***** Register and define API *****/
        
        /**
         * Manages the status bar instances for ace.
         * @singleton
         **/
        handle.freezePublicAPI({
            /**
             * Show all the status bars.
             */
            show : show,
            
            /**
             * Hide all the status bars.
             */
            hide : hide,
            
            /**
             * Retrieve the status bar that belongs to an ace editor.
             * @param {Editor} ace  The ace editor the status bar belongs to.
             * @return {ace.status.Statusbar}
             */
            getStatusbar : getStatusbar,
            
            /**
             * Inserts CSS for the statusbar.
             * @private
             */
            draw : draw
        });
            
        /***** Initialization *****/
        
        var counter = 0;
        
        function Statusbar(editor){
            var plugin = new Plugin("Ajax.org", deps);
            var emit   = plugin.getEmitter();
            
            var showRange;
            
            var bar, lblSelection, lblStatus, lblRowCol, lblTabs, lblSyntax; // ui elements
            
            statusbars[editor.name] = plugin;
            
            var loaded = false;
            function load(){
                if (loaded) return false;
                loaded = true;
                
                function updateBarVisible(){
                    if (!settings.getBool("user/ace/statusbar/@show")) {
                        bar && bar.hide();
                        menuItem.enable();
                    }
                    else {
                        draw();
                        bar.show();
                        menuItem.enable();
                    }
                }
                
                settings.on("user/ace/statusbar", updateBarVisible, plugin);
                
                handle.on("show", show);
                
                if (settings.getBool("user/ace/statusbar/@show"))
                    draw();
                
                editor.on("documentLoad", function(e){
                    var session = e.doc.getSession();
                    session.statusBar = plugin;
                    session.session.on("changeMode", function(e){ statusUpdate.schedule(); });
                }, plugin);
                editor.on("documentActivate", function(e){ statusUpdate.schedule(); }, plugin);
                editor.on("documentUnload", function(e){
                    delete e.doc.getSession().statusBar;
                }, plugin);
            }
            
            var drawn = false;
            function draw(){
                if (drawn) return;
                drawn = true;
            
                handle.draw();
                
                // Create UI elements
                var htmlNode = editor.ace.container.parentNode.host;
                ui.insertMarkup(htmlNode, markup, plugin);
                
                function setTheme(e){
                    var theme    = e.theme;
                    if (!theme) return;

                    var cssClass = theme.cssClass;
                    var isDark   = theme.isDark;
                    
                    var bg = ui.getStyleRule("." + cssClass, "backgroundColor");
                    
                    bar.setAttribute("class", isDark ? "ace_dark" : "");
                    if (bg) {
                        bg = bg.replace(/rgb\((.*)\)/, "rgba($1, 0.9)");
                        bar.$ext.style.backgroundColor = bg;
                    }
                }
                editor.on("themeChange", setTheme);
                
                bar          = plugin.getElement("bar");
                lblSelection = plugin.getElement("lblSelectionLength");
                lblStatus    = plugin.getElement("lblEditorStatus");
                lblRowCol    = plugin.getElement("lblRowCol");
                lblTabs      = plugin.getElement("lblTabs");
                lblSyntax    = plugin.getElement("lblSyntax");
                
                // For editor search of submenus
                bar.editor = editor;
                
                // Set sub menus
                var button = plugin.getElement("btnSbPrefs");
                button.setAttribute("submenu", menu);

                lblTabs.setAttribute("submenu", menuTabs);
                
                var mnuSyntax = menus.get("View/Syntax").menu;
                lblSyntax.setAttribute("submenu", mnuSyntax);
                lblSyntax.on("mousedown", function(){
                    if (editor.activeDocument)
                        tabs.focusTab(editor.activeDocument.tab);
                });
        
                // Click behavior for the labels
                lblSelection.on("click", function(){
                    showRange = !showRange;
                    updateStatus();
                });
                
                lblRowCol.on("click", function(){
                    gotoline.gotoline(null, null, true);
                });
                
                // Hook into ace
                var ace = editor.ace;
                if (!ace.$hasStatusBar) {
                    // Throttle UI updates
                    ace.on("changeSelection", function() { selStatusUpdate.schedule() });
                    ace.on("changeStatus", function() { statusUpdate.schedule() });
                    ace.renderer.on("scrollbarVisibilityChanged", function(e, renderer) {
                        bar.$ext.style.right = renderer.scrollBarV.getWidth() + 5 + "px";
                        bar.$ext.style.bottom = renderer.scrollBarH.getHeight() + 3 + "px";
                    });
                    ace.$hasStatusBar = true;
                    
                    var theme = editor.theme;
                    setTheme({theme: theme});
                }
                
                // Update status information
                updateStatus();
                
                emit("draw");
            }
            
            var selStatusUpdate = lang.delayedCall(updateSelStatus, 10);
            var statusUpdate    = lang.delayedCall(updateStatus, 10);
            
            /***** Helper Functions *****/
            
            function updateSelStatus(){
                var ace = editor.ace;
                if (!ace) return;
                
                if (!ace.selection.isEmpty()) {
                    var range = ace.getSelectionRange();
                    var selLen;
                    
                    if (showRange) {
                        selLen = "(" +
                            (range.end.row - range.start.row) + ":" +
                            (range.end.column - range.start.column) + ")";
                    } 
                    else {
                        selLen = "(" + ace.session.getTextRange(range).length + " Bytes)";
                    }
                    
                    lblSelection.setAttribute("caption", selLen);
                } 
                else {
                    lblSelection.setAttribute("caption", "");
                }
                
                var cursor = ace.selection.lead;
                lblRowCol.setAttribute("caption", (cursor.row + 1) + ":" + (cursor.column + 1));
            }
            
            function updateStatus() {
                var ace = editor.ace;
                
                updateSelStatus();
                
                lblTabs.setAttribute("caption", 
                    (ace.getOption("useSoftTabs") ? "Spaces" : "Tabs") + ": "
                      + ace.getOption("tabSize")); // "\\[" + + "\\]");
                
                var status = "";
                if (ace.$vimModeHandler)
                    status = ace.$vimModeHandler.getStatusText();
                else if (ace.commands.recording)
                    status = "REC";
                    
                lblStatus.setAttribute("caption", status);
                
                var caption = aceHandle.getSyntaxCaption(ace.session.syntax);
                lblSyntax && lblSyntax.setAttribute("caption", caption);
            }
            
            /***** Lifecycle *****/
            
            plugin.on("load", function(){
                load();
            });
            plugin.on("enable", function(){
                
            });
            plugin.on("disable", function(){
                
            });
            plugin.on("unload", function(){
                loaded = false;
            });
            
            /***** Register and define API *****/
            
            /**
             * The status bar for ace editors.
             * @class ace.status.Statusbar
             **/
            plugin.freezePublicAPI({
                /**
                 * Redraw the display of the statusbar
                 */
                update : updateStatus
            });
            
            plugin.load("acestatus" + counter++);
            
            return plugin;
        }
        
        register(null, {
            "ace.status" : handle
        });
    }
});