/*:
 * @plugindesc Adds visual-only floating offsets to map events.
 * @author BlueGrail
 *
 * @help
 * Event note tags:
 *   <BG_FLOAT_X:4,80>
 *   <BG_FLOAT_Y:3,60>
 *
 * First value is pixel distance.
 * Second value is one full wave cycle in frames.
 *
 * This changes only the displayed sprite position. The event tile,
 * trigger, and collision position stay unchanged.
 */

(function() {
  'use strict';

  function readFloatTag(event, key) {
    if (!event || !event.event) return null;
    var data = event.event();
    var text = data && data.meta ? String(data.meta[key] || '') : '';
    var match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    return {
      amount: Number(match[1]),
      period: Math.max(1, Number(match[2]))
    };
  }

  function floatTag(event, key) {
    event._bgFloatTags = event._bgFloatTags || {};
    if (!Object.prototype.hasOwnProperty.call(event._bgFloatTags, key)) {
      event._bgFloatTags[key] = readFloatTag(event, key);
    }
    return event._bgFloatTags[key];
  }

  function floatOffset(event, key) {
    var tag = floatTag(event, key);
    if (!tag) return 0;
    var phase = (Graphics.frameCount + event.eventId() * 11) / tag.period;
    return Math.sin(phase * Math.PI * 2) * tag.amount;
  }

  var _Sprite_Character_updatePosition = Sprite_Character.prototype.updatePosition;
  Sprite_Character.prototype.updatePosition = function() {
    _Sprite_Character_updatePosition.call(this);
    if (!(this._character instanceof Game_Event)) return;
    this.x += floatOffset(this._character, 'BG_FLOAT_X');
    this.y += floatOffset(this._character, 'BG_FLOAT_Y');
  };
})();
