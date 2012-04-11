var Attack = {
	classes: ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"],
	infinity: false,

	// Initialize attacks
	init: function () {
		include("common/CollMap.js");

		if (include("common/Attacks/" + this.classes[me.classid] + ".js")) {
			ClassAttack.init();
		}

		if (Config.AttackSkill[1] < 0 && Config.AttackSkill[3] < 0) {
			showConsole();
			print("�c1No attack skills set. Don't expect your bot to attack.");
		}

		if (me.gametype === 1) {
			this.checkInfinity();
		}
	},

	// Check if player or his merc are using Infinity, and adjust resistance checks based on that
	checkInfinity: function () {
		var i, merc, items;

		for (i = 0; !merc && i < 3; i += 1) {
			merc = me.getMerc();

			delay(50);
		}

		// Check merc infinity

		if (merc) {
			items = merc.getItems();

			if (items) {
				for (i = 0; i < items.length; i += 1) {
					if (items[i].getPrefix(20566)) {
						print("Infinity detected");

						this.infinity = true;

						return true;
					}
				}
			}
		}

		// Check player infinity

		items = me.findItems(-1, 1);

		if (items) {
			for (i = 0; i < items.length; i += 1) {
				if (items[i].getPrefix(20566)) {
					print("Infinity detected");

					this.infinity = true;

					return true;
				}
			}
		}

		return false;
	},

	// Kill a monster based on its classId
	kill: function (classId) {
		if (Config.AttackSkill[1] < 0) {
			return false;
		}

		var i, monList, target,
			attackCount = 0;

		for (i = 0; i < 3; i += 1) {
			target = getUnit(1, classId);

			if (target) {
				break;
			}

			delay(50);
		}

		if (!target) {
			throw new Error("Attack.kill: Target not found");
		}

		while (attackCount < 300 && this.checkMonster(target)) {
			if (Config.Dodge) {
				if (attackCount % 5 === 0) {
					monList = this.buildDodgeList();
				}

				monList.sort(Sort.units);

				if (getDistance(me, monList[0]) < 10) {
					this.dodge(target, 15, monList);
				}
			}

			Misc.townCheck(true);

			if (ClassAttack.doAttack(target, attackCount % 15 === 0) < 2) {
				break;
			}

			if (!copyUnit(target).x) { // Check if unit got invalidated, happens if necro raises a skeleton from the boss's corpse.
				return true;
			}

			attackCount += 1;
		}

		return (target.mode === 0 || target.mode === 12);
	},

	// Clear monsters in a section based on range and spectype or clear monsters around a boss monster
	clear: function (range, spectype, bossId, sortfunc, pickit) { // probably going to change to passing an object
		switch (arguments.length) {
		case 0:
			range = 25;
		case 1:
			spectype = 0;
		case 2:
			bossId = false;
		case 3:
			sortfunc = false;
		case 4:
			pickit = true;
			break;
		}

		if (typeof (range) !== "number") {
			throw new Error("Attack.clear: range must be a number.");
		}

		var i, boss, orgx, orgy, target, result, monsterList, dodgeList,
			gidAttack = [],
			attackCount = 0;

		if (Config.AttackSkill[1] < 0 || Config.AttackSkill[3] < 0) {
			return false;
		}

		if (!sortfunc) {
			sortfunc = this.sortMonsters;
		}

		if (bossId) {
			for (i = 0; !boss && i < 3; i += 1) {
				boss = getUnit(1, bossId);

				delay(50);
			}

			if (!boss) {
				throw new Error("Attack.clear: " + bossId + " not found");
			}

			orgx = boss.x;
			orgy = boss.y;
		} else {
			orgx = me.x;
			orgy = me.y;
		}

		monsterList = [];
		dodgeList = [];
		target = getUnit(1);

		if (target) {
			do {
				if (this.checkMonster(target)) {
					monsterList.push(copyUnit(target));
				}
			} while (target.getNext());
		}

		while (monsterList.length > 0) {
			monsterList.sort(sortfunc);

			target = copyUnit(monsterList[0]);

			if (typeof target.x !== "undefined" && Math.abs(orgx - target.x) <= range && Math.abs(orgy - target.y) <= range && (!spectype || (target.spectype & spectype)) && this.checkMonster(target) && (me.getSkill(54, 1) || !checkCollision(me, target, 0x1))) {
				if (Config.Dodge) {
					if (attackCount % 5 === 0) {
						dodgeList = this.buildDodgeList();
					}

					if (attackCount > 0 && dodgeList.length > 0) {
						dodgeList.sort(Sort.units);

						if (getDistance(me, dodgeList[0]) < 8) {
							//this.dodge(dodgeList[0], 15, dodgeList);
							this.dodge(target, 15, dodgeList);
						}
					}
				}

				Misc.townCheck(true);
				me.overhead("attacking " + target.name + " spectype " + target.spectype + " id " + target.classid);

				result = ClassAttack.doAttack(target, attackCount % 15 === 0);

				switch (result) {
				case 1:
					monsterList.shift();
					break;
				case 2:
				case 3:
					if (!(target.spectype & 0x7)) {
						for (i = 0; i < gidAttack.length; i += 1) {
							if (gidAttack[i].gid === target.gid) {
								break;
							}
						}

						if (i === gidAttack.length) {
							gidAttack.push({gid: target.gid, attacks: 0});
						}

						gidAttack[i].attacks += 1;

						if (gidAttack[i].attacks > 12) {
							print("�c1Skipping " + target.name);
							monsterList.shift();
						}
					}

					attackCount += 1;

					break;
				default:
					return false;
				}
			} else {
				monsterList.shift();
			}
		}

		ClassAttack.afterAttack();

		if (pickit) {
			this.openChests(range);
			Pickit.pickItems();
		}

		return true;
	},

	// Filter monsters based on classId, spectype and range
	getMob: function (classid, spectype, range) {
		var monsterList = [],
			monster = getUnit(1, classid);

		if (monster) {
			do {
				if (getDistance(me, monster) <= range && (!spectype || (monster.spectype & spectype)) && this.checkMonster(monster)) {
					monsterList.push(copyUnit(monster));
				}
			} while (monster.getNext());
		}

		if (!monsterList.length) {
			return false;
		}

		return monsterList;
	},

	// Clear an already formed array of monstas
	clearList: function (list, sortfunc) {
		var i, target, result, dodgeList,
			gidAttack = [],
			attackCount = 0,
			monsterList = list.slice(0);

		if (!sortfunc) {
			sortfunc = this.sortMonsters;
		}

		while (monsterList.length > 0) {
			monsterList.sort(sortfunc);

			target = copyUnit(monsterList[0]);

			if (typeof target.x !== "undefined" && this.checkMonster(target)) {
				if (Config.Dodge) {
					if (attackCount % 5 === 0) {
						dodgeList = this.buildDodgeList();
					}

					if (attackCount > 0 && dodgeList.length > 0) {
						dodgeList.sort(Sort.units);

						if (getDistance(me, dodgeList[0]) < 8) {
							//this.dodge(dodgeList[0], 15, dodgeList);
							this.dodge(target, 15, dodgeList);
						}
					}
				}

				Misc.townCheck(true);
				me.overhead("attacking " + target.name + " spectype " + target.spectype + " id " + target.classid);

				result = ClassAttack.doAttack(target, attackCount % 15 === 0);

				switch (result) {
				case 1:
					monsterList.shift();
					break;
				case 2:
				case 3:
					if (!(target.spectype & 0x7)) {
						for (i = 0; i < gidAttack.length; i += 1) {
							if (gidAttack[i].gid === target.gid) {
								break;
							}
						}

						if (i === gidAttack.length) {
							gidAttack.push({gid: target.gid, attacks: 0});
						}

						gidAttack[i].attacks += 1;

						if (gidAttack[i].attacks > 12) {
							print("�c1Skipping " + target.name);
							monsterList.shift();
						}
					}

					attackCount += 1;

					break;
				default:
					return false;
				}
			} else {
				monsterList.shift();
			}
		}

		ClassAttack.afterAttack();
		this.openChests(30);

		if (attackCount > 0) {
			Pickit.pickItems();
		}

		return true;
	},

	// Draw lines around a room on minimap
	markRoom: function (room, color) {
		new Line(room.x * 5, room.y * 5, room.x * 5, room.y * 5 + room.ysize, color, true);
		new Line(room.x * 5, room.y * 5, room.x * 5 + room.xsize, room.y * 5, color, true);
		new Line(room.x * 5 + room.xsize, room.y * 5, room.x * 5 + room.xsize, room.y * 5 + room.ysize, color, true);
		new Line(room.x * 5, room.y * 5 + room.ysize, room.x * 5 + room.xsize, room.y * 5 + room.ysize, color, true);
	},

	// Clear an entire area based on monster spectype
	clearLevel: function (spectype) {
		var room, result, rooms;

		room = getRoom();

		if (!room) {
			return false;
		}

		if (arguments.length < 1) {
			spectype = 0;
		}

		rooms = [];

		do {
			rooms.push([room.x * 5 + room.xsize / 2, room.y * 5 + room.ysize / 2]);
		} while (room.getNext());

		while (rooms.length > 0) {
			rooms.sort(Sort.points);
			room = rooms.shift();

			result = Pather.getNearestWalkable(room[0], room[1], 15, 2);

			if (result) {
				//this.markRoom(getRoom(room[0], room[1]), 0x84);
				Pather.moveTo(result[0], result[1], 3);

				if (!this.clear(30, spectype)) {
					return false;
				}
			}/* else {
				this.markRoom(getRoom(room[0], room[1]), 0x62);
			}*/
		}

		CollMap.reset();

		return true;
	},

	// Sort monsters based on distance, spectype and classId (summoners are attacked first)
	sortMonsters: function (unitA, unitB) {
		var ids = [58, 59, 60, 61, 62, 101, 102, 103, 104, 105, 278, 279, 280, 281, 282, 298, 299, 300, 645, 646, 647, 662, 663, 664, 667, 668, 669, 670, 675, 676];

		if (ids.indexOf(unitA.classid) > -1) {
			return -1;
		}

		if (ids.indexOf(unitB.classid) > -1) {
			return 1;
		}

		if (Config.BossPriority) {
			if (unitA.spectype & 0x5) {
				return -1;
			}

			if (unitB.spectype & 0x5) {
				return 1;
			}
		}

		if (getDistance(me, unitA) < getDistance(me, unitB)) {
			return -1;
		}

		return 1;
	},

	// Check if a set of coords is valid/accessable
	validSpot: function (x, y) {
		var result;

		if (!me.area) { // Just in case
			return false;
		}

		try { // Treat thrown errors as invalid spot
			result = getCollision(me.area, x, y);
		} catch (e) {
			return false;
		}

		// Avoid non-walkable spots, objects
		if (result === undefined || result & 0x1 || result & 0x400) {
			return false;
		}

		return true;
	},

	// Open chests when clearing
	openChests: function (range) {
		var i, unit,
			ids = ["chest", "weaponrack", "armorstand"];

		for (i = 0; i < ids.length; i += 1) {
			unit = getUnit(2, ids[i]);

			if (unit) {
				do {
					if ((getDistance(me, unit) <= range) && Misc.openChest(unit)) {
						Pickit.pickItems();
					}
				} while (unit.getNext());
			}
		}
	},

	// Make a list of monsters that will be monitored for dodging
	buildDodgeList: function () {
		var monster = getUnit(1),
			list = [];

		if (monster) {
			do {
				if (this.checkMonster(monster)) {
					list.push(copyUnit(monster));
				}
			} while (monster.getNext());
		}

		return list;
	},

	// Move away from a nearby monster into a more safe position
	dodge: function (unit, distance, list) {
		var i, j, coordx, coordy, count,
			maxcount = 99,
			coords = [],
			goodCoords = [],
			angles = [45, 90, 135, 180, 225, 270, 305, 360];

		// step 1 - build possible dodge positions based on angles

		for (i = 0; i < angles.length; i = i + 1) {
			coordx = Math.round((Math.cos(angles[i] * Math.PI / 180)) * distance + unit.x);
			coordy = Math.round((Math.sin(angles[i] * Math.PI / 180)) * distance + unit.y);

			if (this.validSpot(coordx, coordy)) {
				coords.push([coordx, coordy]);
			}
		}

		if (coords.length === 0) { // no valid positions - don't move
			me.overhead("Can't dodge :(");
			return true;
		}

		coords.sort(Sort.points);

		for (i = 0; i < coords.length; i += 1) {
			count = 0;

			for (j = 0; j < list.length; j += 1) {
				if (list[j].hp > 0 && getDistance(list[j].x, list[j].y, coords[i][0], coords[i][1]) < 10) {
					count += 1;
				}
			}

			if (count < maxcount) {
				goodCoords = [coords[i][0], coords[i][1]];
				maxcount = count;

				if (count === 0) {
					break;
				}
			}
		}

		if (goodCoords.length > 0) { // just in case goodCoords is empty (shouldn't happen)
			if (getDistance(me, goodCoords[0], goodCoords[1]) < 5) { // close enough
				return true;
			}

			me.overhead("Dodge!");
			Pather.moveTo(goodCoords[0], goodCoords[1], 1);
		}

		return true;
	},

	// Check if a monster is attackable
	checkMonster: function (unit) {
		if (!unit) {
			return false;
		}

		if (unit.type === 0 && unit.mode !== 17) { // Player
			return true;
		}

		if (unit.mode === 0 || unit.mode === 12) { // Dead monster
			return false;
		}

		if (unit.getStat(172) === 2) {	// Friendly monster/NPC
			return false;
		}

		if (unit.classid === 543 && me.area === 131) { // Baal in Throne
			return false;
		}

		if (getBaseStat("monstats", unit.classid, "neverCount")) { // neverCount base stat - hydras, traps etc.
			return false;
		}

		switch (unit.classid) {
		case 110: // Vultures
		case 111:
		case 112:
		case 113:
		case 114:
		case 608:
			if (unit.mode === 8) { // Flying
				return false;
			}

			break;
		case 68: // Sand Maggots
		case 69:
		case 70:
		case 71:
		case 72:
		case 679:
		case 258: // Water Watchers
		case 259:
		case 260:
		case 261:
		case 262:
		case 263:
			if (unit.mode === 14) { // Submerged/Burrowed
				return false;
			}

			break;
		}

		var i, j, rval,
			tempArray = [];

EnchantLoop: // Skip enchanted monsters
		for (i = 0; i < Config.SkipEnchant.length; i += 1) {
			tempArray = Config.SkipEnchant[i].toLowerCase().split(" and ");

			for (j = 0; j < tempArray.length; j += 1) {
				switch (tempArray[j]) {
				case "extra strong":
					tempArray[j] = 5;

					break;
				case "extra fast":
					tempArray[j] = 6;

					break;
				case "cursed":
					tempArray[j] = 7;

					break;
				case "magic resistant":
					tempArray[j] = 8;

					break;
				case "fire enchanted":
					tempArray[j] = 9;

					break;
				case "lightning enchanted":
					tempArray[j] = 17;

					break;
				case "cold enchanted":
					tempArray[j] = 18;

					break;
				case "mana burn":
					tempArray[j] = 25;

					break;
				case "teleportation":
					tempArray[j] = 26;

					break;
				case "spectral hit":
					tempArray[j] = 27;

					break;
				case "stone skin":
					tempArray[j] = 28;

					break;
				case "multiple shots":
					tempArray[j] = 29;

					break;
				}
			}

			for (j = 0; j < tempArray.length; j += 1) {
				if (!unit.getEnchant(tempArray[j])) {
					continue EnchantLoop;
				}
			}

			//print("�c1Skipping " + unit.name + " (enchant skip -" + Config.SkipEnchant[i] + ")");

			return false;
		}

ImmuneLoop: // Skip immune monsters
		for (i = 0; i < Config.SkipImmune.length; i += 1) {
			tempArray = Config.SkipImmune[i].toLowerCase().split(" and ");

			for (j = 0; j < tempArray.length; j += 1) {
				if (this.checkResist(unit, Config.SkipImmune[i])) { // Infinity calculations are built-in
					continue ImmuneLoop;
				}
			}

			//print("�c1Skipping " + unit.name + " (immunity skip -" + Config.SkipImmune[i] + ")");

			return false;
		}

AuraLoop: // Skip monsters with auras
		for (i = 0; i < Config.SkipAura.length; i += 1) {
			rval = true;

			switch (Config.SkipAura[i].toLowerCase()) {
			case "fanaticism":
				if (unit.getState(49)) {
					rval = false;
				}

				break;
			case "might":
				if (unit.getState(33)) {
					rval = false;
				}

				break;
			case "holy fire":
				if (unit.getState(35)) {
					rval = false;
				}

				break;
			case "blessed aim":
				if (unit.getState(40)) {
					rval = false;
				}

				break;
			case "conviction":
				if (unit.getState(28)) {
					rval = false;
				}

				break;
			case "holy freeze":
				if (unit.getState(43)) {
					rval = false;
				}

				break;
			case "holy shock":
				if (unit.getState(46)) {
					rval = false;
				}

				break;
			}

			if (!rval) {
				//print("�c1Skipping " + unit.name + " (aura skip -" + Config.SkipAura[i] + ")");

				return false;
			}
		}

		return true;
	},

	// Get element by skill number
	getSkillElement: function (skillId) {
		this.elements = ["physical", "fire", "lightning", "magic", "cold", "poison", "none"];

		switch (skillId) {
		case 74: // Corpse Explosion
		case 147: // Frenzy
		case 500: // Summoner
			return "physical";
		case 101: // Holy Bolt
			return "none";
		}

		var eType = getBaseStat("skills", skillId, "etype");

		if (typeof (eType) === "number") {
			return this.elements[eType];
		}

		return false;
	},

	// Get a monster's resistance to specified element
	getResist: function (unit, type) {
		if (unit.type === 0) { // player
			return 0;
		}

		switch (type) {
		case "physical":
			return unit.getStat(36);
		case "fire":
			return unit.getStat(39);
		case "lightning":
			return unit.getStat(41);
		case "magic":
			return unit.getStat(37);
		case "cold":
			return unit.getStat(43);
		case "poison":
			return unit.getStat(45);
		case "none":
			return 0;
		}

		return 100;
	},

	// Check if a monster is immune to specified attack type
	checkResist: function (unit, type) {
		if (unit.type === 0) { // player
			return 0;
		}

		if (this.infinity && ["fire", "lightning", "cold"].indexOf(type) > -1) {
			if (unit.getState(29)) {
				return this.getResist(unit, type) < 100;
			} else {
				return this.getResist(unit, type) < 117;
			}
		}

		return this.getResist(unit, type) < 100;
	},

	// Detect use of bows/crossbows
	usingBow: function () {
		var item;

		item = me.getItem(-1, 1);

		if (item) {
			do {
				if (item.bodylocation === 4 || item.bodylocation === 5) {
					switch (item.itemType) {
					case 27: // Bows
					case 85: // Amazon Bows
						return "bow";
					case 35: // Crossbows
						return "crossbow";
					}
				}
			} while (item.getNext());
		}

		return false;
	},

	// Find an optimal attack position and move or walk to it
	getIntoPosition: function (unit, distance, coll, walk) {
		if (typeof walk === "undefined") {
			walk = false;
		}

		var n, i, j, k, l, cx, cy, t,
			coords = [],
			angles = [0, 45, 90, 135, 180, 225, 270, 305];

		t = getTickCount();

		for (n = 0; n < 4; n += 1) {
			if (n > 0) {
				distance = Math.floor(distance / 2);
			}

			for (i = 0; i < angles.length; i += 1) {
				cx = Math.round((Math.cos(angles[i] * Math.PI / 180)) * distance + unit.x);
				cy = Math.round((Math.sin(angles[i] * Math.PI / 180)) * distance + unit.y);

				if (!(CollMap.getColl(cx, cy) & 0x1)) {
					coords.push([cx, cy, angles[i]]);
				}
			}

			//print("�c9potential spots: �c2" + coords.length);

			if (coords.length > 0) {
				coords.sort(Sort.points); // sort angles by final spot distance
			} else { // no good final spots
				//print("reducing optimal spot range");
				continue;
			}

MainLoop:
			for (i = 0; i < coords.length; i += 1) { // sorted angles are coords[i][2]
				for (j = 1; j < distance; j += 1) {
					cx = Math.round((Math.cos(coords[i][2] * Math.PI / 180)) * j + unit.x);
					cy = Math.round((Math.sin(coords[i][2] * Math.PI / 180)) * j + unit.y);

					for (k = cx - 1; k <= cx + 1; k += 1) { // check thicker line
						for (l = cy - 1; l <= cy + 1; l += 1) {
							if (CollMap.getColl(k, l) & coll) {
								continue MainLoop;
							}
						}
					}
				}

				//print("�c9optimal pos build time: �c2" + (getTickCount() - t) + " �c9distance from target: �c2" + getDistance(cx, cy, unit.x, unit.y));
				CollMap.reset();

				return walk ? Pather.walkTo(cx, cy) : Pather.moveTo(cx, cy);
			}
		}

		CollMap.reset();
		print("optimal pos fail. dist: " + getDistance(me, unit) + " red. dist: " + distance);

		return false;
	}
};