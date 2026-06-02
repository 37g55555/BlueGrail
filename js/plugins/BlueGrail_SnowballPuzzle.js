/*:
 * @plugindesc Handles rolling snowballs for the Act 2 avalanche escape puzzle.
 * @author BlueGrail
 *
 * @help
 * Add <BG_SNOWBALL> to an event note.
 * Optional tags:
 *   <BG_ROUTE:xChaseY>
 *   <BG_ROUTE:entryThenChase>
 *   <BG_ENTRY_TARGET:8,3>
 *   <BG_SIZE:2>
 *   <BG_SPEED:5>
 *   <BG_WAIT:60>
 *   <BG_GOAL_WAIT:60>
 */

(function() {
  'use strict';

  var START_SWITCH_ID = 8;

  var MAP_CONFIGS = {
    4: {
      startSelfSwitch: [4, 1, 'A'],
      stopSelfSwitch: null,
      route: 'xChaseY',
      direction: 6,
      minX: 0,
      maxX: 16,
      minY: 1,
      maxY: 8,
      spawnX: 0,
      spawnY: null,
      despawnX: 16,
      despawnY: null
    },
    5: {
      startSelfSwitch: null,
      stopSelfSwitch: [5, 2, 'A'],
      stopPlayerY: 34,
      route: 'chase',
      direction: 2,
      minX: 0,
      maxX: 13,
      minY: 1,
      maxY: 39,
      spawnX: 0,
      spawnY: null,
      despawnX: null,
      despawnY: 39
    }
  };

  function config() {
    return MAP_CONFIGS[$gameMap.mapId()];
  }

  function selfSwitchOn(key) {
    return key && $gameSelfSwitches.value(key);
  }

  function isPuzzleActive(cfg) {
    return isPuzzleReady(cfg) && !isGoalReached(cfg);
  }

  function isPuzzleReady(cfg) {
    if (!cfg) return false;
    if (!$gameSwitches.value(START_SWITCH_ID)) return false;
    if (cfg.startSelfSwitch && !selfSwitchOn(cfg.startSelfSwitch)) return false;
    return true;
  }

  function isGoalReached(cfg) {
    if (!cfg) return false;
    if (cfg.stopSelfSwitch && selfSwitchOn(cfg.stopSelfSwitch)) return true;
    if (cfg.stopPlayerY !== undefined && $gamePlayer.y >= cfg.stopPlayerY) return true;
    return false;
  }

  function isSnowball(event) {
    var data = event && event.event && event.event();
    return !!(data && data.note && data.note.indexOf('<BG_SNOWBALL>') >= 0);
  }

  function isSnowballActive(event) {
    var cfg = config();
    return isSnowball(event) && isPuzzleActive(cfg) &&
      !(event._bgSnowball && event._bgSnowball.goalStarted);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function noteNumber(meta, key, defaultValue, minValue) {
    var value = Number(meta[key]);
    if (!isFinite(value)) return defaultValue;
    if (minValue !== undefined) value = Math.max(minValue, value);
    return value;
  }

  function notePoint(meta, key) {
    var text = String(meta[key] || '');
    var match = text.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
    if (!match) return null;
    return {
      x: Number(match[1]),
      y: Number(match[2])
    };
  }

  function resetSnowball(event, cfg) {
    var state = event._bgSnowball;
    var x = cfg.spawnX === null ? state.spawnX : cfg.spawnX;
    var y = cfg.spawnY === null ? state.spawnY : cfg.spawnY;
    event.locate(x, y);
    event.setDirection(cfg.direction);
    event.setMoveSpeed(state.speed);
    state.wait = state.baseWait;
    state.step = 0;
    state.entryDone = false;
    state.goalWait = null;
    state.goalStarted = false;
  }

  function initSnowball(event, cfg) {
    if (event._bgSnowball && event._bgSnowball.mapId === $gameMap.mapId()) return;
    var meta = event.event().meta;
    var entryTarget = notePoint(meta, 'BG_ENTRY_TARGET');
    event._bgSnowball = {
      mapId: $gameMap.mapId(),
      spawnX: clamp(event.x, cfg.minX, cfg.maxX),
      spawnY: clamp(event.y, cfg.minY, cfg.maxY),
      route: String(meta.BG_ROUTE || cfg.route),
      entryTargetX: entryTarget ? clamp(entryTarget.x, cfg.minX, cfg.maxX) : null,
      entryTargetY: entryTarget ? clamp(entryTarget.y, cfg.minY, cfg.maxY) : null,
      baseWait: noteNumber(meta, 'BG_WAIT', 0, 0),
      goalBaseWait: noteNumber(meta, 'BG_GOAL_WAIT', 0, 0),
      speed: noteNumber(meta, 'BG_SPEED', 5, 1),
      size: noteNumber(meta, 'BG_SIZE', 2, 1),
      wait: 0,
      step: 0,
      entryDone: false,
      goalWait: null,
      goalStarted: false
    };
    resetSnowball(event, cfg);
  }

  function stepToward(value, target, min, max) {
    if (target > value) return clamp(value + 1, min, max);
    if (target < value) return clamp(value - 1, min, max);
    return clamp(value, min, max);
  }

  function chaseY(event, minY, maxY) {
    return stepToward(event.y, $gamePlayer.y, minY, maxY);
  }

  function chaseX(event, cfg) {
    return stepToward(event.x, $gamePlayer.x, cfg.minX, cfg.maxX);
  }

  function chaseBoth(event, cfg) {
    return {
      x: chaseX(event, cfg),
      y: chaseY(event, cfg.minY, cfg.maxY)
    };
  }

  function targetTile(event, cfg) {
    var state = event._bgSnowball;
    if (state.route === 'xChaseY') {
      return { x: event.x + 1, y: chaseY(event, cfg.minY, cfg.maxY) };
    }

    if (state.route === 'entryThenChase' &&
        state.entryTargetX !== null &&
        state.entryTargetY !== null &&
        event.x === state.entryTargetX &&
        event.y === state.entryTargetY) {
      state.entryDone = true;
    }

    if (state.route === 'entryThenChase' &&
        !state.entryDone &&
        state.entryTargetX !== null &&
        state.entryTargetY !== null &&
        (event.x !== state.entryTargetX || event.y !== state.entryTargetY)) {
      return { x: state.entryTargetX, y: state.entryTargetY };
    }

    return chaseBoth(event, cfg);
  }

  function isPastEnd(event, cfg) {
    if (cfg.despawnX !== null) return event.x >= cfg.despawnX;
    return event.y >= cfg.despawnY;
  }

  function moveTowardTarget(event, target) {
    var dx = target.x - event.x;
    var dy = target.y - event.y;

    if (dx < 0 && dy > 0) event.moveDiagonally(4, 2);
    else if (dx > 0 && dy > 0) event.moveDiagonally(6, 2);
    else if (dx > 0 && dy < 0) event.moveDiagonally(6, 8);
    else if (dx < 0 && dy < 0) event.moveDiagonally(4, 8);
    else if (dx > 0) event.moveStraight(6);
    else if (dx < 0) event.moveStraight(4);
    else if (dy > 0) event.moveStraight(2);
    else if (dy < 0) event.moveStraight(8);
  }

  function isInSnowballArea(character, event, x, y) {
    var size = Math.max(1, event._bgSnowball ? event._bgSnowball.size : 1);
    var left = x;
    var right = x + size - 1;
    var top = y - size + 1;
    var bottom = y;
    return character.x >= left && character.x <= right &&
      character.y >= top && character.y <= bottom;
  }

  function hitsParty(event, x, y) {
    if (isInSnowballArea($gamePlayer, event, x, y)) return true;

    var followers = $gamePlayer.followers && $gamePlayer.followers();
    if (!followers) return false;

    var visibleFollowers = followers.visibleFollowers ?
      followers.visibleFollowers() :
      followers._data || [];

    for (var i = 0; i < visibleFollowers.length; i++) {
      if (isInSnowballArea(visibleFollowers[i], event, x, y)) return true;
    }
    return false;
  }

  function updateSnowball(event, cfg) {
    initSnowball(event, cfg);
    var ready = isPuzzleReady(cfg);
    var goalMode = isGoalReached(cfg) || event._bgSnowball.goalStarted;
    var active = ready && !goalMode;
    event.setThrough(true);
    event.setTransparent(!ready);
    if (!ready) return;

    if (!active) {
      if (!event._bgSnowball.goalStarted) {
        event._bgSnowball.goalStarted = true;
        event.locate(event.x, event.y);
        event.setDirection(cfg.direction);
      }
      if (event._bgSnowball.goalWait === null) {
        event._bgSnowball.goalWait = event._bgSnowball.goalBaseWait;
      }
      if (event.isMoving()) return;
      if (event._bgSnowball.goalWait > 0) {
        event.setTransparent(false);
        event._bgSnowball.goalWait -= 1;
        return;
      }
      if (isPastEnd(event, cfg)) {
        event.setTransparent(true);
        return;
      }
      event.setTransparent(false);
      event._bgSnowball.step += 1;
      if (event._bgSnowball.step % 2 === 0) event.turnRight90();
      else event.turnLeft90();
      event.moveStraight(cfg.direction);
      return;
    }

    if (event.isMoving() || $gameMap.isEventRunning()) return;

    if (event._bgSnowball.wait > 0) {
      event.setTransparent(true);
      event._bgSnowball.wait -= 1;
      return;
    }

    event.setTransparent(false);

    if (hitsParty(event, event.x, event.y)) {
      event.start();
      return;
    }

    if (isPastEnd(event, cfg)) {
      resetSnowball(event, cfg);
      return;
    }

    event._bgSnowball.step += 1;
    if (event._bgSnowball.step % 2 === 0) event.turnRight90();
    else event.turnLeft90();

    var target = targetTile(event, cfg);
    moveTowardTarget(event, target);

    if (event._bgSnowball.route === 'entryThenChase' &&
        event._bgSnowball.entryTargetX !== null &&
        event._bgSnowball.entryTargetY !== null &&
        event.x === event._bgSnowball.entryTargetX &&
        event.y === event._bgSnowball.entryTargetY) {
      event._bgSnowball.entryDone = true;
    }

    if (hitsParty(event, event.x, event.y)) {
      event.start();
    }
  }

  function resetMapSnowballs(cfg) {
    $gameMap.events().forEach(function(event) {
      if (!isSnowball(event)) return;
      initSnowball(event, cfg);
      resetSnowball(event, cfg);
    });
  }

  function updatePuzzleReady(cfg) {
    var ready = isPuzzleReady(cfg);
    if (ready && !$gameMap._bgSnowballWasReady) {
      resetMapSnowballs(cfg);
    }
    $gameMap._bgSnowballWasReady = ready;
  }

  var _Game_Map_update = Game_Map.prototype.update;
  Game_Map.prototype.update = function(sceneActive) {
    _Game_Map_update.call(this, sceneActive);

    var cfg = config();
    if (!cfg) return;
    updatePuzzleReady(cfg);

    this.events().forEach(function(event) {
      if (isSnowball(event)) updateSnowball(event, cfg);
    });
  };

  var _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function(mapId) {
    _Game_Map_setup.call(this, mapId);
    this._bgSnowballWasReady = false;
  };

  var _Game_Event_checkEventTriggerTouch = Game_Event.prototype.checkEventTriggerTouch;
  Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
    if (isSnowball(this)) return;
    _Game_Event_checkEventTriggerTouch.call(this, x, y);
  };

  var _Game_Event_start = Game_Event.prototype.start;
  Game_Event.prototype.start = function() {
    if (isSnowball(this) && !isSnowballActive(this)) return;
    _Game_Event_start.call(this);
  };
})();
