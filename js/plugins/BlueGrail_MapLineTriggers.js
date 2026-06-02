/*:
 * @plugindesc Handles Map002 x-line triggers, path movement, and camera focus helpers.
 * @author Codex
 *
 * @help
 * This plugin replaces repeated Player Touch events used as x-coordinate
 * trigger lines in Act 2 maps.
 *
 * Plugin commands:
 *   BGPathMove eventId x y wait
 *   BGPathMove this x y wait
 *   BGPathMove player x y wait
 *   BGPathMove eventId x y speed=5 wait
 *   BGCameraFocus x y zoom duration
 *   BGCameraPlayer zoom duration
 */

(function() {
    'use strict';

    var LINE_TRIGGERS = [
        { mapId: 2, x: 14, commonEventId: 2 },
        { mapId: 2, x: 21, commonEventId: 3 },
        { mapId: 2, x: 41, commonEventId: 4 }
    ];

    var REMOTE_CLICK_COOLDOWN = 30;

    function triggerMatches(trigger, mapId, x) {
        if (trigger.mapId !== mapId) return false;
        if (trigger.x !== undefined && trigger.x !== x) return false;
        return true;
    }

    function runTrigger(trigger) {
        if (trigger.commonEventId) {
            $gameTemp.reserveCommonEvent(trigger.commonEventId);
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function cameraDisplayForTile(x, y) {
        var displayX = Number(x) + 0.5 - $gameMap.screenTileX() / 2;
        var displayY = Number(y) + 0.5 - $gameMap.screenTileY() / 2;
        return {
            x: clamp(displayX, 0, Math.max(0, $gameMap.width() - $gameMap.screenTileX())),
            y: clamp(displayY, 0, Math.max(0, $gameMap.height() - $gameMap.screenTileY()))
        };
    }

    function screenPointForTile(x, y, display) {
        return {
            x: (Number(x) + 0.5 - display.x) * $gameMap.tileWidth(),
            y: (Number(y) + 0.5 - display.y) * $gameMap.tileHeight()
        };
    }

    function startCameraMove(display, duration) {
        duration = Math.max(1, Number(duration || 30));
        $gameMap._bgCameraMove = {
            startX: $gameMap.displayX(),
            startY: $gameMap.displayY(),
            targetX: display.x,
            targetY: display.y,
            duration: duration,
            remaining: duration
        };
    }

    function startCameraFocus(x, y, zoom, duration) {
        x = x === undefined ? 8 : Number(x);
        y = y === undefined ? 0 : Number(y);
        var display = cameraDisplayForTile(x, y);
        var zoomCenter = screenPointForTile(x, y, display);
        startCameraMove(display, duration);
        $gameScreen.startZoom(zoomCenter.x, zoomCenter.y, Number(zoom || 1), Number(duration || 30));
    }

    function startCameraPlayer(zoom, duration) {
        startCameraFocus($gamePlayer.x, $gamePlayer.y, zoom, duration);
    }

    function updateCameraMove() {
        var move = $gameMap._bgCameraMove;
        if (!move) return;

        move.remaining -= 1;
        var progress = 1 - move.remaining / move.duration;
        var x = move.startX + (move.targetX - move.startX) * progress;
        var y = move.startY + (move.targetY - move.startY) * progress;
        $gameMap.setDisplayPos(x, y);

        if (move.remaining <= 0) {
            $gameMap.setDisplayPos(move.targetX, move.targetY);
            $gameMap._bgCameraMove = null;
        }
    }

    function remoteClickEventAt(x, y) {
        var events = $gameMap.events();
        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            var data = event.event();
            if (event.x === x && event.y === y &&
                    data.name === '설산' && /Remote/.test(data.note || '')) {
                return event;
            }
        }
        return null;
    }

    function updateRemoteClickCooldown() {
        $gameTemp._bgRemoteClickCooldown = Math.max(
            0,
            Number($gameTemp._bgRemoteClickCooldown || 0) - 1
        );
    }

    function updateRemoteClick() {
        updateRemoteClickCooldown();
        if ($gameMap.mapId() !== 3) return;
        if (!TouchInput.isTriggered()) return;

        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) {
            $gameTemp._bgRemoteClickCooldown = REMOTE_CLICK_COOLDOWN;
            return;
        }

        if ($gameTemp._bgRemoteClickCooldown > 0) return;

        var x = $gameMap.canvasToMapX(TouchInput.x);
        var y = $gameMap.canvasToMapY(TouchInput.y);
        var event = remoteClickEventAt(x, y);
        if (!event) return;

        $gameTemp._bgRemoteClickCooldown = REMOTE_CLICK_COOLDOWN;
        $gamePlayer.turnTowardCharacter(event);
        event.start();
    }

    var _Game_Map_update = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        _Game_Map_update.call(this, sceneActive);
        updateCameraMove();
        updateRemoteClick();
    };

    function characterFromToken(interpreter, token) {
        if (token === 'this') return $gameMap.event(interpreter.eventId());
        if (token === 'player') return $gamePlayer;
        return $gameMap.event(Number(token || 0));
    }

    function parsePathMoveOptions(args) {
        var options = {
            wait: false,
            speed: null
        };

        for (var i = 3; i < args.length; i++) {
            var arg = String(args[i] || '').toLowerCase();
            if (arg === 'wait') {
                options.wait = true;
            } else if (arg.indexOf('speed=') === 0) {
                options.speed = Number(arg.split('=')[1]);
            } else if (/^\d+$/.test(arg)) {
                options.speed = Number(arg);
            }
        }

        if (options.speed !== null) {
            options.speed = clamp(options.speed, 1, 6);
        }
        return options;
    }

    function clearPathTarget(character) {
        if (!character || !character._bgPathTarget) return;
        var originalSpeed = character._bgPathTarget.originalSpeed;
        character._bgPathTarget = null;
        if (originalSpeed !== null && originalSpeed !== undefined) {
            character.setMoveSpeed(originalSpeed);
        }
    }

    function setPathTarget(character, x, y, options) {
        if (!character) return;
        options = options || {};
        var originalSpeed = null;
        if (options.speed !== null && options.speed !== undefined) {
            originalSpeed = character.moveSpeed();
            character.setMoveSpeed(options.speed);
        }
        character._bgPathTarget = {
            x: Number(x),
            y: Number(y),
            originalSpeed: originalSpeed,
            failedFrames: 0
        };
    }

    function updatePathTarget(character) {
        var target = character._bgPathTarget;
        if (!target) return;
        if (character.isMoving()) return;
        if (character.x === target.x && character.y === target.y) {
            clearPathTarget(character);
            return;
        }

        var direction = character.findDirectionTo(target.x, target.y);
        if (direction > 0) {
            character.moveStraight(direction);
            if (character.isMovementSucceeded()) {
                target.failedFrames = 0;
            } else {
                target.failedFrames += 1;
            }
        } else {
            target.failedFrames += 1;
        }

        if (target.failedFrames >= 30) {
            clearPathTarget(character);
        }
    }

    var _Game_CharacterBase_initMembers = Game_CharacterBase.prototype.initMembers;
    Game_CharacterBase.prototype.initMembers = function() {
        _Game_CharacterBase_initMembers.call(this);
        this._bgPathTarget = null;
    };

    var _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _Game_Event_update.call(this);
        updatePathTarget(this);
    };

    var _Game_Player_update = Game_Player.prototype.update;
    Game_Player.prototype.update = function(sceneActive) {
        _Game_Player_update.call(this, sceneActive);
        updatePathTarget(this);
    };

    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === 'BGCameraFocus') {
            startCameraFocus(args[0], args[1], args[2], args[3]);
            return;
        }

        if (command === 'BGCameraPlayer') {
            startCameraPlayer(args[0], args[1]);
            return;
        }

        if (command !== 'BGPathMove') return;

        var character = characterFromToken(this, args[0]);
        var options = parsePathMoveOptions(args);
        setPathTarget(character, args[1], args[2], options);
        if (options.wait) {
            this._bgPathMoveCharacter = character;
            this.setWaitMode('bgPathMove');
        }
    };

    var _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'bgPathMove') {
            var character = this._bgPathMoveCharacter;
            if (character && (character.isMoving() || character._bgPathTarget)) return true;
            this._bgPathMoveCharacter = null;
            this._waitMode = '';
            return false;
        }
        return _Game_Interpreter_updateWaitMode.call(this);
    };

    var _Game_Player_updateNonmoving = Game_Player.prototype.updateNonmoving;
    Game_Player.prototype.updateNonmoving = function(wasMoving) {
        _Game_Player_updateNonmoving.call(this, wasMoving);
        if (!wasMoving) return;
        if ($gameMap.isEventRunning()) return;
        if ($gameMessage.isBusy()) return;
        if (this.isTransferring()) return;

        var mapId = $gameMap.mapId();
        var x = this.x;
        for (var i = 0; i < LINE_TRIGGERS.length; i++) {
            var trigger = LINE_TRIGGERS[i];
            if (triggerMatches(trigger, mapId, x)) {
                runTrigger(trigger);
                return;
            }
        }
    };
})();
