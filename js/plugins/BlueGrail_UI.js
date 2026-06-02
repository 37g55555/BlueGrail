/*:
 * @plugindesc BlueGrail UI tweaks: game font, item-only category, and hidden menu gold.
 * @author BlueGrail
 *
 * @help
 * Forces GameFont, leaves only the Item category in the item scene,
 * and hides the gold window from the main Esc menu.
 */

(function() {
    'use strict';

    Window_Base.prototype.standardFontFace = function() {
        return 'GameFont';
    };

    Window_ItemCategory.prototype.makeCommandList = function() {
        this.addCommand(TextManager.item, 'item');
    };

    Scene_Menu.prototype.createGoldWindow = function() {
        this._goldWindow = null;
    };
})();
