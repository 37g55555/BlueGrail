/*:
 * @plugindesc Adds message bust images and centered message lines.
 * @author Codex
 *
 * @help
 * Escape codes:
 *   \BUST[리오,right]
 *   \BUST[미아,left]
 *   \BUST[clear]
 *   \CENTER
 *
 * The most recently shown bust is treated as the active speaker.
 * Other visible busts are dimmed automatically.
 *
 * Bust images are loaded from img/pictures.
 */

(function() {
    'use strict';

    var BUST_PICTURES = {
        '리오': 'Rio_Default',
        '리오_default': 'Rio_Default',
        '리오_smile': 'Rio_Smile',
        '미아': 'Mia_Default',
        '미아_default': 'Mia_Default',
        '미아_smile': 'Mia_Smile',
        '미아_angry': 'Mia_Angry',
        'rio': 'Rio_Default',
        'rio_default': 'Rio_Default',
        'rio_smile': 'Rio_Smile',
        'mia': 'Mia_Default',
        'mia_default': 'Mia_Default',
        'mia_smile': 'Mia_Smile',
        'mia_angry': 'Mia_Angry'
    };

    var BUST_MARGIN = 24;
    var BUST_MAX_HEIGHT_RATE = 0.96;
    var BUST_ACTIVE_TONE = [0, 0, 0, 0];
    var BUST_DIM_TONE = [-88, -88, -88, 0];

    function obtainBracketText(textState) {
        var arr = /^\[(.*?)\]/.exec(textState.text.slice(textState.index));
        if (arr) {
            textState.index += arr[0].length;
            return arr[1];
        }
        return '';
    }

    function visibleLineText(window, text) {
        return window.convertEscapeCharacters(text)
            .replace(/\x1bBUST\[(.*?)\]/gi, '')
            .replace(/\x1bCENTER/gi, '')
            .replace(/\x1bC\[\d+\]/gi, '')
            .replace(/\x1bI\[\d+\]/gi, '    ')
            .replace(/\x1b[\$\.\|\^!><\{\}\\]/g, '')
            .replace(/\x1b[A-Z]+\[(.*?)\]/gi, '')
            .replace(/\x1b[A-Z]+/gi, '');
    }

    function collectStandaloneBustLines(window, text) {
        var lines = text.split('\n');
        var cleanedLines = [];

        lines.forEach(function(line) {
            var hasBust = false;
            var stripped = line.replace(/\\BUST\[(.*?)\]/gi, function(_, body) {
                hasBust = true;
                window.blueGrailRunBustCommand(body);
                return '';
            });

            if (hasBust && stripped.trim().length === 0) {
                return;
            }
            cleanedLines.push(line);
        });

        return cleanedLines.join('\n');
    }

    function preloadBustPictures() {
        var loaded = {};
        Object.keys(BUST_PICTURES).forEach(function(key) {
            var name = BUST_PICTURES[key];
            if (!loaded[name]) {
                ImageManager.loadPicture(name);
                loaded[name] = true;
            }
        });
    }

    var _Window_Message_initialize = Window_Message.prototype.initialize;
    Window_Message.prototype.initialize = function() {
        _Window_Message_initialize.call(this);
        this._blueGrailBustSprites = {};
        this._blueGrailActiveBustPosition = null;
        this._blueGrailBustClearDelay = 0;
    };

    Window_Message.prototype.blueGrailBustName = function(name) {
        return BUST_PICTURES[name] || name;
    };

    Window_Message.prototype.blueGrailBustParent = function() {
        var scene = SceneManager._scene;
        if (!scene) return null;
        var index = scene.children.indexOf(scene._windowLayer);
        if (index >= 0) {
            return {
                add: function(sprite) {
                    scene.addChildAt(sprite, index);
                }
            };
        }
        return {
            add: function(sprite) {
                scene.addChild(sprite);
            }
        };
    };

    Window_Message.prototype.blueGrailApplyBustTones = function() {
        var sprites = this._blueGrailBustSprites || {};
        Object.keys(sprites).forEach(function(key) {
            var sprite = sprites[key];
            if (!sprite || !sprite.setColorTone) return;
            if (!this._blueGrailActiveBustPosition || key === this._blueGrailActiveBustPosition) {
                sprite.setColorTone(BUST_ACTIVE_TONE);
            } else {
                sprite.setColorTone(BUST_DIM_TONE);
            }
        }, this);
    };

    Window_Message.prototype.blueGrailShowBust = function(name, position) {
        position = (position || 'right').toLowerCase();
        var pictureName = this.blueGrailBustName(name);

        var current = this._blueGrailBustSprites[position];
        if (current && current._blueGrailPictureName === pictureName) {
            this._blueGrailActiveBustPosition = position;
            this.blueGrailApplyBustTones();
            this.blueGrailUpdateBustSpritePlacement(current);
            return;
        }

        this.blueGrailClearBust(position);
        var sprite = new Sprite(ImageManager.loadPicture(pictureName));
        sprite._blueGrailBustPosition = position;
        sprite._blueGrailPictureName = pictureName;
        sprite.opacity = 255;
        this._blueGrailBustSprites[position] = sprite;
        this._blueGrailActiveBustPosition = position;
        this.blueGrailApplyBustTones();
        var parent = this.blueGrailBustParent();
        if (parent) parent.add(sprite);
    };

    Window_Message.prototype.blueGrailUpdateBustPlacement = function() {
        var sprites = this._blueGrailBustSprites || {};
        Object.keys(sprites).forEach(function(key) {
            this.blueGrailUpdateBustSpritePlacement(sprites[key]);
        }, this);
    };

    Window_Message.prototype.blueGrailUpdateBustSpritePlacement = function(sprite) {
        if (!sprite || !sprite.bitmap || !sprite.bitmap.isReady()) return;

        var maxHeight = Math.floor(Graphics.boxHeight * BUST_MAX_HEIGHT_RATE);
        var scale = Math.min(1, maxHeight / sprite.bitmap.height);
        sprite.scale.x = scale;
        sprite.scale.y = scale;

        var width = sprite.bitmap.width * scale;
        var height = sprite.bitmap.height * scale;
        var pos = sprite._blueGrailBustPosition;

        if (pos === 'left') {
            sprite.x = BUST_MARGIN;
        } else if (pos === 'center') {
            sprite.x = Math.floor((Graphics.boxWidth - width) / 2);
        } else {
            sprite.x = Graphics.boxWidth - width - BUST_MARGIN;
        }
        sprite.y = Graphics.boxHeight - height;
    };

    Window_Message.prototype.blueGrailClearBust = function(position) {
        this._blueGrailBustSprites = this._blueGrailBustSprites || {};
        if (position) {
            var sprite = this._blueGrailBustSprites[position];
            if (sprite && sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
            delete this._blueGrailBustSprites[position];
            if (this._blueGrailActiveBustPosition === position) {
                this._blueGrailActiveBustPosition = null;
            }
            this.blueGrailApplyBustTones();
            return;
        }

        Object.keys(this._blueGrailBustSprites).forEach(function(key) {
            var sprite = this._blueGrailBustSprites[key];
            if (sprite && sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
        }, this);
        this._blueGrailBustSprites = {};
        this._blueGrailActiveBustPosition = null;
    };

    Window_Message.prototype.blueGrailRunBustCommand = function(body) {
        var args = String(body || '').split(',');
        var name = (args[0] || '').trim();
        var position = (args[1] || 'right').trim();
        if (!name || name.toLowerCase() === 'clear') {
            this.blueGrailClearBust(args[1] ? position : null);
        } else {
            this.blueGrailShowBust(name, position);
        }
    };

    Window_Message.prototype.blueGrailScheduleBustClear = function() {
        this._blueGrailBustClearDelay = 6;
    };

    Window_Message.prototype.blueGrailUpdateBustClear = function() {
        if (this._blueGrailBustClearDelay <= 0) return;
        if ($gameMessage.hasText()) return;
        this._blueGrailBustClearDelay -= 1;
        if (this._blueGrailBustClearDelay <= 0) {
            this.blueGrailClearBust();
        }
    };

    var _Scene_Boot_loadSystemImages = Scene_Boot.loadSystemImages;
    Scene_Boot.loadSystemImages = function() {
        if (_Scene_Boot_loadSystemImages) {
            _Scene_Boot_loadSystemImages.call(this);
        }
        preloadBustPictures();
    };

    var _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        this._blueGrailBustClearDelay = 0;
        var originalTexts = $gameMessage._texts.slice();
        var text = $gameMessage.allText();
        var cleaned = collectStandaloneBustLines(this, text);
        $gameMessage._texts = cleaned.length > 0 ? cleaned.split('\n') : [''];
        _Window_Message_startMessage.call(this);
        $gameMessage._texts = originalTexts;
    };

    var _Window_Message_update = Window_Message.prototype.update;
    Window_Message.prototype.update = function() {
        _Window_Message_update.call(this);
        this.blueGrailUpdateBustPlacement();
        this.blueGrailUpdateBustClear();
    };

    var _Window_Message_terminateMessage = Window_Message.prototype.terminateMessage;
    Window_Message.prototype.terminateMessage = function() {
        _Window_Message_terminateMessage.call(this);
        this.blueGrailScheduleBustClear();
    };

    var _Window_Message_processEscapeCharacter =
        Window_Message.prototype.processEscapeCharacter;
    Window_Message.prototype.processEscapeCharacter = function(code, textState) {
        if (code === 'BUST') {
            this.blueGrailRunBustCommand(obtainBracketText(textState));
            return;
        }

        if (code === 'CENTER') {
            var end = textState.text.indexOf('\n', textState.index);
            if (end < 0) end = textState.text.length;
            var line = visibleLineText(this, textState.text.slice(textState.index, end));
            var width = this.textWidth(line);
            var areaWidth = this.contents.width - textState.left;
            textState.x = textState.left + Math.max(0, Math.floor((areaWidth - width) / 2));
            return;
        }

        _Window_Message_processEscapeCharacter.call(this, code, textState);
    };
})();
