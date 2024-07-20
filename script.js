(function() {
	"use strict";

	const KEY = "sigj-2024"
	const DEV = location.href.startsWith("file://")
	const DARKYELLOW = "#F9E076"
	const YEAR = 3600 * 24 * 365.25

	const {
		createApp,
		reactive,
		computed,
		unref,
		ref,
		watch,
		onMounted,
		onUnmounted,
		getCurrentInstance
	} = Vue;

	function defaultSave() {
		return {
			started: false,
			lastTick: Date.now(),
			playtime: 0,
			timeSinceEscape: 0,
			state: 0,
			evasionPoints: 0,
			cash: 0,
			xp: 0,
			energySpent: 0,
			energy: 0,
			totalCash: 0,
			upgrades: Array(UPGRADES.length).fill(0),
			puzzlesCompleted: [false, false],
			resetTimes: 0,
			corporationUnlocked: false,
			researchUnlocked: false,
			lawyersUnlocked: false,
			strategiesUnlocked: false,
			experience: 0,
			auto: {
				actions: Array(ACTIONS.length).fill(false),
				upgrades: Array(UPGRADES.length).fill(false)
			},
			work: 0,
			meals: 0,
			junk: 0,
			tools: 0,
			lawyers: Array(LAWYER_TIERS.length).fill().map(() => ({
				bought: 0,
				produced: 0
			})),
			strategies: 0,
			strategySize: 5,
			startedTrial: false,
			autoLawyers: false,
			trialTime: 0,
			evidence: 0,
			totalNerf: 1,
		}
	}

	function encode() {
		return btoa(JSON.stringify(save))
	}

	function saveGame() {
		localStorage.setItem(KEY, encode())
	}

	function autoSave() {
		setInterval(() => {
			saveGame()
			console.log("Game saved!")
		}, DEV ? 1000 : 10000)
	}

	function fix(obj, orig) {
		for (const key of Object.keys(orig)) {
			const item = obj[key];
			const other = orig[key];
			if (item === undefined) obj[key] = other;
			else if (typeof item === "object" && item !== null) fix(item, other);
		}
	}

	function loadSave(str) {
		try {
			const result = JSON.parse(atob(str))
			const start = defaultSave()
			fix(result, start)
			Object.assign(save, result)
			generateMap()
		} catch (e) {
			console.error(e)
			messages.push("Your save was invalid.")
		}
	}

	function load() {
		const s = localStorage.getItem(KEY)
		if (s) loadSave(s)
		else Object.assign(save, defaultSave())
	}

	function format(num, acc = 2) {
		const neg = num < 0 ? "-" : ""

		if (num < 0) num *= -1
		if (isNaN(num)) return neg + "NaN"
		if (num === Infinity) return neg + "∞"
		if (num === 0) return num.toFixed(acc)

		const ex = Math.log10(num)
		const e = Math.floor(ex)
		if (ex < Math.min(-acc, 0) && acc > 1) {
			const m = num / Math.pow(10, e)
			const be = Math.log10(Math.max(-e, 1)) >= 9
			return neg + (be ? "" : m.toFixed(2)) + "e" + format(e, 0)
		} else if (e < 6) {
			const a = Math.max(Math.min(acc - e, acc), 0)
			return neg + (a > 0 ? num.toFixed(a) : num.toFixed(a).toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,'))
		} else {
			const m = num / Math.pow(10, e)
			const be = Math.log10(e) >= 9
			return neg + (be ? "" : m.toFixed(2)) + "e" + format(e, 0)
		}
	}

	function formatGain(num, acc) {
		return (num >= 0 ? "+" : "") + format(num, acc)
	}

	function formatMult(num, acc) {
		return "×" + format(num, acc)
	}

	function formatList(i) {
		if (i.length <= 2) return i.join(" and ")
		return i.slice(0, -1).join(", ") + ", and " + i.at(-1)
	}

	const TIMES = [
		[60, "seconds"],
		[60, "minutes"],
		[24, "hours"],
		[365.25, "days"],
		[10, "years"],
		[10, "decades"],
		[10, "centuries"],
		[1e7, "millenniums"],
		[Infinity, "eons"],
	]

	function formatTime(val, acc) {
		for (const [dur, name] of TIMES) {
			if (val <= dur) return `${format(val, acc)} ${name}`
			val /= dur
		}
	}

	function random(a, b) {
		return (b - a) * Math.random() + a
	}

	function randomInt(a, b) {
		// Math.random() can't generate 1
		return Math.floor(random(a, b + 1))
	}

	function log(a, b) {
		return Math.log(a) / Math.log(b)
	}

	const save = reactive({})
	const messages = reactive([])
	const selected = ref(-1)
	const puzzle0 = reactive({
		attempted: false,
		count: 0,
		pos: 0,
		circle: 0,
		dir: true
	})
	const puzzle1 = reactive({
		attempted: false,
		guess: [],
		code: 0
	})
	const saveData = reactive({
		importSave: false,
		hardReset: false
	})
	const strategyTemp = reactive({
		map: [],
		selected: 0,
		reroll: 0,
		auto: {
			searched: new Set(),
			stack: [],
			time: 0
		}
	})
	const evidenceTemp = reactive({
		evidence: [],
		time: 0,
	})

	const endTime = ref(0)
	window.endTime = endTime

	function solvePuzzle0() {
		save.puzzlesCompleted[0] = true
		save.state++
		selected.value = -1
		messages.push("You escaped the jail! Better get going though, they'll be looking for you soon.")
	}

	function solvePuzzle1() {
		save.puzzlesCompleted[1] = true
		save.state++
		selected.value = -1
		save.lawyersUnlocked = true
		messages.push("You got your PIN number correct! When you landed, you saw an advertisement for lawyers. Maybe they could help you?")
	}

	const ACTIONS = [{
			name: "Wake up",
			desc: "Ughhhh that didn't feel good...",
			flavorDesc: "What even is this place?",
			time: 2,
			show: computed(() => save.state === 0),
			finish: () => {
				save.state++
				messages.push("You seem to be in a jail.")
			}
		},
		{
			name: "Rest",
			desc: "Gain some energy and clear your head",
			flavorDesc: "That felt better",
			time: 5,
			show: computed(() => save.state === 1),
			finish: () => {
				save.state++
				save.energy = 100
				messages.push("That felt better...")
			}
		},
		{
			name: "Work",
			desc: "Work in the jail for some money, but use energy",
			time: 3,
			mods: {
				sec: {
					energy: -10,
				}
			},
			finish: () => {
				const base = (save.upgrades[35] + 1) * selfBoost.value / 10
				const cash = random(base, 2 * base)
				messages.push(`You got $${format(cash, 2)}.`)
				save.cash += cash
			},
			show: computed(() => save.state >= 2 && save.state <= 5),
		},
		{
			name: "Eat",
			desc: "Wait for prison guards to give you some food",
			time: 3,
			finish: () => {
				save.meals++
			},
			show: computed(() => save.state >= 2 && save.state <= 5),
		},
		{
			name: "Find junk",
			desc: "Find some junk around here",
			time: 3,
			mods: {
				sec: {
					energy: -10
				}
			},
			finish: () => {
				const base = (save.upgrades[34] + 1) * selfBoost.value * Math.pow(1.2, save.upgrades[40])
				const junk = random(base, 2 * base)
				if (junk === 0) messages.push("You didn't find anything")
				else messages.push(`You found ${format(junk, 2)} junk.`)
				save.junk += junk
			},
			show: computed(() => save.state >= 2 && save.state <= 5),
		},
		{
			name: "Rest",
			desc: "Rest to gain energy, using up your Total Energy.",
			time: 3,
			finish: () => {
				const spend = Math.min(rawEnergy.value - save.energySpent, energyCap.value - save.energy)
				save.energy += spend
				save.energySpent += spend
			},
			can: computed(() => save.energy < energyCap.value && save.energySpent < rawEnergy.value),
			show: computed(() => save.state >= 2)
		},
		{
			name: "Research",
			desc: "Pernamently unlock Research.",
			time: 5,
			require: "$2 and 40 Junk (not spent)",
			can: computed(() => save.cash >= 2 && save.junk >= 40),
			show: computed(() => save.state >= 2 && !save.researchUnlocked),
			finish: () => {
				save.researchUnlocked = true
			}
		},
		{
			name: "Crowbar",
			desc: "Make a crowbar out of junk.",
			time: 5,
			mods: {
				sec: {
					energy: -10
				}
			},
			require: "100 Junk",
			can: computed(() => save.junk >= 100),
			show: computed(() => save.state === 2),
			finish: () => {
				save.state++
				save.junk -= 100
			}
		},
		{
			name: "Destruction",
			desc: "Create a big enough hole so that you can escape.",
			time: 5,
			mods: {
				sec: {
					energy: -10
				}
			},
			show: computed(() => save.state === 3),
			finish: () => {
				messages.push("Somehow no one noticed...?")
				save.state++
			}
		},
		{
			name: "Bribery",
			desc: "Bribe one of your jail cell guards",
			time: 5,
			require: "$5",
			show: computed(() => save.state === 4),
			can: computed(() => save.cash >= 5),
			finish: () => {
				messages.push("You have no idea why that worked, but now you can escape!")
				save.cash -= 5
				save.state++
			},
		},
		{
			name: "Escape",
			desc: "Run to the exit to escape. You might need energy for after the escape however...",
			flavorDesc: "It's kind of tiring though",
			time: 5,
			show: computed(() => save.state === 5),
			can: computed(() => rawEnergy.value - save.energySpent >= 1000),
			require: "1000 free Total Energy",
			mods: {
				sec: {
					energy: -20
				}
			},
			finish: () => {
				messages.push("The exit seems to be guarded by a pin pad...")
				save.state++
			}
		},
		{
			name: "Escape",
			desc: "Try to get the door open",
			time: 30,
			show: computed(() => save.state === 6),
			start: () => {
				if (save.puzzlesCompleted[0]) {
					messages.push("The door is still weak from the time you tried to pry it open, meaning it wasn't too difficult getting out of there.")
					solvePuzzle0()
				} else {
					puzzle0.attempted = true
					puzzle0.pos = random(0, 0.75)
					puzzle0.circle = 0
				}
			}
		},
		{
			name: "Work",
			desc: "Work and get money along with some experience",
			time: 3,
			mods: {
				sec: {
					energy: computed(() => {
						let energy = -5
						energy *= Math.pow(1.5, save.upgrades[1])
						if (save.upgrades[12] >= 1) energy *= 3
						return energy
					}),
					cash: computed(() => {
						let cash = Math.pow(2, save.upgrades[1])
						if (save.upgrades[12] >= 1) cash *= 3
						return cash
					}),
					xp: computed(() => {
						let xp = Math.pow(2, save.upgrades[1])
						if (save.upgrades[12] >= 1) xp *= 3
						return xp
					}),
				},
				/*mult: {
					evasionPoints: computed(() => 2 * Math.pow(1.5, save.upgrades[1]))
				}*/
			},
			show: computed(() => save.state >= 7),
		},
		{
			name: "Explore",
			desc: "Look around for some opportunities.",
			flavorDesc: "Might be risky though...",
			time: 5,
			mods: {
				sec: {
					energy: -10
				},
				mult: {
					evasionPoints: 2,
				}
			},
			require: "$300",
			can: computed(() => save.cash >= 300),
			show: computed(() => save.state === 7),
			finish: () => {
				save.state++
				save.cash -= 300
				messages.push("You found a bunch of stuff that you could buy, but you'll need some money...")
			}
		},
		{
			name: "Leave",
			desc: "Leave for another country",
			time: 90,
			show: computed(() => save.upgrades[21] >= 1 && save.state === 8),
			start: () => {
				if (save.puzzlesCompleted[1]) {
					messages.push("You remembered your PIN code this time.")
					solvePuzzle1()
				} else {
					puzzle1.attempted = true
					puzzle1.code = randomInt(1000, 9999)
				}
			}
		}
	]

	const UPGRADES = [{
			item: true,
			name: "Floor",
			desc: "Not very comfortable, but it's something.",
			effects: {
				good: ["Automatically rest"]
			},
			show: computed(() => true),
			max: 1,
			cost: {
				cash: 100,
			},
		},
		{
			name: "Job Bonus",
			desc: "Use your experience on the job to get a bonus!",
			flavorDesc: "Is this even a good idea?",
			effects: {
				good: [
					formatMult(2, 0) + " Work Cash gain",
					formatMult(2, 0) + " Work XP gain"
				],
				bad: [
					formatMult(1.5, 1) + " Work Energy usage"
				]
			},
			show: computed(() => save.state >= 7),
			max: 5,
			cost: {
				xp: computed(() => {
					return 10 * Math.pow(4, save.upgrades[1])
				})
			},
		},
		{
			item: true,
			name: "Worn-out Matress",
			desc: "It's at least better than sleeping on the floor.",
			effects: {
				good: [formatMult(1.5, 1) + " productivity"]
			},
			show: computed(() => true),
			max: 1,
			cost: {
				cash: 200,
			},
		},
		// the two upgrades removed
		// I could remove these and fix the indexes but that takes too much work and could cause bugs
		, , , ,
		{
			evasion: true,
			name: "Sneaky",
			desc: "Use your experience with the police to divide Evasion loss.",
			effects: {
				good: ["/2 to Evasion loss"],
			},
			show: computed(() => true),
			max: Infinity,
			cost: {
				experience: computed(() => {
					return 3 * Math.pow(6, save.upgrades[7])
				}),
			},
			eff: computed(() => Math.pow(2, save.upgrades[7])),
			effDesc: x => `/${format(x)} to Evasion loss`
		},
		{
			evasion: true,
			name: "Sneakier",
			desc: "Use your experience with the environment around you to increase the Evaded cap.",
			effects: {
				good: ["+10% to Evaded cap"],
			},
			show: computed(() => true),
			max: Infinity,
			cost: {
				experience: computed(() => {
					return 3 * Math.pow(4, save.upgrades[8])
				}),
			},
			eff: computed(() => 0.1 * save.upgrades[8]),
			effDesc: x => `+${format(x * 100)}% to Evaded cap`
		}, , ,
		{
			evasion: true,
			name: "Speed",
			desc: "Use your experience to increase Action speed.",
			effects: {
				good: [`+${formatMult(0.5, 1)} to Action speed`],
			},
			show: computed(() => true),
			max: Infinity,
			cost: {
				experience: computed(() => {
					return 3 * Math.pow(2, save.upgrades[11])
				}),
			},
			eff: computed(() => 1 + 0.5 * save.upgrades[11]),
			effDesc: x => `${formatMult(x)} to Action speed`
		},
		{
			item: true,
			name: "New Mattress",
			desc: "Much more comfortable than the previous one, making you more efficent.",
			effects: {
				good: [formatMult(2, 0) + " to productivity"],
			},
			show: computed(() => true),
			max: 1,
			cost: {
				cash: 1000
			},
		},
		{
			name: "Persuasion",
			desc: "Convince other people to help you on your quest to escape jail.",
			show: computed(() => save.upgrades[12] >= 1),
			max: 1,
			cost: {
				cash: 20000,
				xp: 10000
			},
		},
		{
			corp: true,
			name: "Convince",
			desc: "Convince a person to help you.",
			flavorDesc: "It takes so much effort...",
			effects: {
				good: [
					computed(() => `+$${format(workerProds.value.cash)}/sec`),
					computed(() => `+${format(workerProds.value.xp)} XP/sec`),
				],
			},
			show: computed(() => true),
			max: Infinity,
			cost: {
				cash: computed(() => {
					let workers = save.upgrades[14]
					const eff = 1 - save.upgrades[17] * 0.05
					return Math.pow(1.15, eff * workers) * 10000
				}),
				xp: computed(() => {
					let workers = save.upgrades[14]
					const eff = 1 - save.upgrades[17] * 0.05
					return Math.pow(1.2, eff * workers) * 2000
				})
			},
		}, ,
		{
			corp: true,
			name: "Productivity",
			desc: "All workers produce 20% more.",
			show: computed(() => true),
			max: Infinity,
			cost: {
				cash: computed(() => {
					return 1e5 * Math.pow(2.5, save.upgrades[16])
				}),
				xp: computed(() => {
					return 5e4 * Math.pow(2.5, save.upgrades[16])
				})
			}
		},
		{
			corp: true,
			name: "Cheapism",
			desc: "The cost for workers scales 5% slower.",
			show: computed(() => true),
			max: 4,
			cost: {
				cash: computed(() => {
					return 1e5 * Math.pow(5, save.upgrades[17])
				}),
			}
		}, , , ,
		{
			name: "Escape",
			desc: "Buy plane tickets to flee to another country and unlock a new Action.",
			show: computed(() => save.upgrades[13] >= 1),
			max: 1,
			cost: {
				cash: 5e7
			}
		}, ,
		{
			lawyer: true,
			name: "Strategizing",
			desc: "You have a lot of work, but you'll need good strategies...",
			show: computed(() => save.upgrades[21] >= 1),
			max: 1,
			cost: {
				work: YEAR * 20
			},
		},
		{
			lawyer: true,
			name: "Thinking...",
			desc: "Get one of your lawyers to try to come up with a strategy.",
			show: computed(() => save.upgrades[23] >= 1),
			max: Infinity,
			cost: {
				strategies: computed(() => 2 * Math.pow(save.upgrades[24] + 1, 0.8) * Math.pow(1.3, save.upgrades[24]))
			},
			eff: computed(() => save.upgrades[24]),
			effDesc: x => `${format(x)} attempts/sec`
		},
		{
			lawyer: true,
			name: "Complexity",
			desc: "Make more complicated strategies by increasing the max Strategy size by 1.",
			show: computed(() => save.upgrades[23] >= 1),
			max: Infinity,
			cost: {
				work: computed(() => YEAR * 1e6 * Math.pow(40, save.upgrades[25]))
			}
		},
		{
			lawyer: true,
			name: "Efficency",
			desc: "Use the work created to make auto-attempts 15% faster.",
			show: computed(() => save.upgrades[23] >= 1),
			max: Infinity,
			cost: {
				work: computed(() => YEAR * 1e4 * Math.pow(100, save.upgrades[26]))
			}
		},
		{
			lawyer: true,
			name: "Speeeed",
			desc: "Reduce the time required to reroll Strategies by 10%.",
			show: computed(() => save.upgrades[23] >= 1),
			max: Infinity,
			cost: {
				work: computed(() => YEAR * 1e3 * Math.pow(10, save.upgrades[27]))
			}
		}, , , , , ,
		{
			name: "Candy bars",
			desc: "Buy a candy bar from the prison shop.",
			max: Infinity,
			cost: {
				cash: computed(() => 0.2 * Math.pow(2, Math.floor(save.upgrades[33] / 10)))
			},
			show: computed(() => save.state >= 2 && save.state <= 5)
		},
		{
			name: "Shovel",
			desc: "Buy a shovel to help you find more junk.",
			max: Infinity,
			show: computed(() => save.state >= 2 && save.state <= 5),
			cost: {
				cash: computed(() => 0.5 + 0.1 * Math.pow(save.upgrades[34], 2))
			}
		},
		{
			name: "Toolmaking",
			desc: "Make some tools using junk, which should help improve your Work quality.",
			max: Infinity,
			show: computed(() => save.state >= 2 && save.state <= 5),
			cost: {
				junk: computed(() => 10 + 2 * Math.pow(save.upgrades[35], 2))
			}
		},
		{
			research: true,
			name: "Jars",
			desc: "Use jars to preserve food.",
			effects: {
				good: [
					"1.1x to Total Energy (retroactive)"
				]
			},
			max: Infinity,
			show: computed(() => true),
			cost: {
				junk: computed(() => 40 * Math.pow(1.5, save.upgrades[36])),
			}
		},
		{
			research: true,
			name: "Efficency",
			desc: "Buy a book on the secrets of doing more in less time.",
			effects: {
				good: [
					"1.15x to all gain"
				]
			},
			max: Infinity,
			show: computed(() => true),
			cost: {
				cash: computed(() => Math.pow(4, save.upgrades[37])),
			}
		}, ,
		{
			name: "Bribery",
			desc: "Bribe police so they won't be after you as much.",
			max: Infinity,
			effects: {
				good: ["/2 to Evasion loss"]
			},
			show: computed(() => save.state >= 7),
			cost: {
				cash: computed(() => 100 * Math.pow(8, save.upgrades[39]))
			}
		},
		{
			research: true,
			name: "Metal Detectors",
			desc: "Repair some metal detectors that you found to get more junk.",
			max: Infinity,
			effects: {
				good: ["1.2x to Junk gain"]
			},
			show: computed(() => save.resetTimes > 0),
			cost: {
				experience: computed(() => 3 * Math.pow(10, save.upgrades[40])),
				junk: computed(() => 50 * Math.pow(4, save.upgrades[40]))
			}
		},
		{
			research: true,
			name: "Experienced",
			desc: "Use your experience to get more experience!",
			max: Infinity,
			effects: {
				good: ["2x to Experience gain"]
			},
			show: computed(() => save.resetTimes > 0),
			cost: {
				xp: computed(() => 500 * Math.pow(7, save.upgrades[41])),
			}
		},
		{
			name: "Learning",
			desc: "Use your experience to gain extra cash.",
			max: Infinity,
			effects: {
				good: ["1.25x to Cash gain"]
			},
			show: computed(() => save.state >= 7),
			cost: {
				xp: computed(() => 100 * Math.pow(4, save.upgrades[42])),
			}
		},
		{
			research: true,
			name: "Automated",
			desc: "Use your experience managing workers to get jobs done automatically, unlocking auto-Actions and auto-Upgrades.",
			max: 1,
			show: computed(() => save.corporationUnlocked),
			cost: {
				cash: 2e5,
				xp: 2e5
			}
		},
		{
			corp: true,
			name: "Multiplicative",
			desc: "Each worker gives +1% to worker production per level of this upgrade.",
			show: computed(() => true),
			max: 2,
			cost: {
				xp: computed(() => 1e6 * Math.pow(10, save.upgrades[44])),
			}
		},
		{
			research: true,
			name: "Productivity^2",
			desc: "Entice workers to be 15% more productive, again.",
			show: computed(() => save.corporationUnlocked),
			max: Infinity,
			cost: {
				junk: computed(() => 1000 * Math.pow(3, save.upgrades[45])),
				xp: computed(() => 50000 * Math.pow(3, save.upgrades[45])),
				experience: computed(() => 10000 * Math.pow(2, save.upgrades[45]))
			}
		},
		{
			research: true,
			name: "Energized",
			desc: "Increase the Energy cap by 40.",
			show: computed(() => save.corporationUnlocked),
			max: 5,
			cost: {
				cash: computed(() => 1e5 * Math.pow(3, save.upgrades[46]))
			}
		},
		{
			research: true,
			name: "Work Experience",
			desc: "Use your experience to triple work gain.",
			show: computed(() => save.lawyersUnlocked),
			max: Infinity,
			cost: {
				cash: computed(() => 1e8 * Math.pow(5, save.upgrades[47])),
				xp: computed(() => 1e7 * Math.pow(5, save.upgrades[47])),
				experience: computed(() => 1e7 * Math.pow(4, save.upgrades[47]))
			}
		}, {
			research: true,
			name: "Quality",
			desc: "Increase the number of edges for Strategies.",
			show: computed(() => save.strategiesUnlocked),
			max: 3,
			cost: {
				strategies: computed(() => 5 * Math.pow(10, save.upgrades[48]))
			}
		},
		{
			research: true,
			name: "Restart",
			desc: "Automatically reroll Strategies if there are no more nodes left to be searched.",
			show: computed(() => save.strategiesUnlocked),
			max: 1,
			cost: {
				strategies: 5000
			}
		}, ,
		{
			research: true,
			name: "Better Strategies",
			desc: "Use your work to make better strategies.",
			effects: {
				good: [formatMult(2, 0) + " strategy gain"]
			},
			show: computed(() => save.strategiesUnlocked),
			max: Infinity,
			cost: {
				work: computed(() => YEAR * 1e4 * Math.pow(100, save.upgrades[51]))
			}
		},
		{
			research: true,
			name: "Automatic Lawyers",
			desc: "Automatically hire lawyers. Can be configured in the Lawyers subtab.",
			show: computed(() => save.strategiesUnlocked),
			max: 1,
			cost: {
				work: YEAR * 1e12
			}
		},
	]

	const LAWYER_TIERS = [{
			name: "Lawyer",
			cost: computed(() => 2e7 * Math.pow(1.5, save.lawyers[0].bought)),
		},
		{
			name: "Assistant",
			cost: computed(() => 1e9 * Math.pow(2, save.lawyers[1].bought))
		},
		{
			name: "Attorney",
			cost: computed(() => 1e10 * Math.pow(2.5, save.lawyers[2].bought)),
		},
		{
			name: "Judge",
			cost: computed(() => 3e11 * Math.pow(3, save.lawyers[3].bought)),
		}
	]

	function getLawyerMulti(idx) {
		let multi = 1
		if (idx < LAWYER_TIERS.length - 1) multi *= 1 + save.lawyers[idx + 1].produced
		if (idx === 0) {
			multi /= save.totalNerf
			multi *= Math.pow(3, save.upgrades[47])
		}
		multi /= idx + 1

		multi *= strategyEffect.value
		multi *= Math.pow(1.15, save.lawyers[idx].bought)

		return multi
	}

	const lawyerEffects = computed(() => {
		const prod = save.work + 1
		return {
			multi: Math.pow(prod, 0.05) * Math.pow(log(prod, 10) + 1, 0.8)
		}
	})

	const strategyData = computed(() => {
		let size = 5
		size += save.upgrades[25]

		return {
			// the randomness is kinda bad
			density: 0.8 + 0.2 * save.upgrades[48],
			reroll: 5 * Math.pow(0.9, save.upgrades[27]),
			size
		}
	})

	const autoAttempts = computed(() => {
		let attempt = UPGRADES[24].eff.value
		attempt *= Math.pow(1.15, save.upgrades[26])
		return attempt
	})

	const strategyGain = computed(() => {
		const size = strategyTemp.map.size - 4
		// It needs to be worth it to use bigger strategies, since the size scales quadratically
		let base = Math.floor(Math.pow(size, 3) / 5 + Math.pow(size, 2) / 2 + size)
		base *= trialEffects.value.buffLawyers
		base *= Math.pow(2, save.upgrades[51])
		return base
	})

	const strategyEffect = computed(() => {
		return Math.pow(Math.log10(save.strategies + 1) + 1, 0.8) *
			Math.pow(save.strategies / 2 + 1, 0.4)
	})

	function generateMap() {
		// SETTINGS
		const size = save.strategySize
		const {
			density
		} = strategyData.value
		const dist = 3

		const total = Math.pow(size, 2)

		const paths = []

		for (let i = 0; i < Math.pow(size, 2); i++) {
			const g = Math.floor(density)
			const p = density - g
			const tries = g + (random(0, 1) <= p ? 1 : 0)

			for (let j = 0; j < tries; j++) {
				const x = i % size
				const y = Math.floor(i / size)

				const minX = Math.max(x - dist, 0)
				const minY = Math.max(y - dist, 0)

				const maxX = Math.min(x + dist, size - 1)
				const maxY = Math.min(y + dist, size - 1)

				const choseX = randomInt(minX, maxX)
				const choseY = randomInt(minY, maxY)

				const id = choseX + choseY * size;

				// Technically it's possible for there to be two instances of the same node
				// but I don't really care
				(paths[i] ?? (paths[i] = [])).push(id);
				(paths[id] ?? (paths[id] = [])).push(i)
			}
		}

		// Save it here because the size could be changed later on while the map is running
		paths.size = size
		strategyTemp.map = paths
		strategyTemp.selected = 0
		strategyTemp.auto.stack = [0]
		strategyTemp.auto.searched = new Set()
	}

	const trialEffects = computed(() => {
		const time = save.trialTime
		const evidence = save.evidence
		const log = Math.log10(evidence + 1) + 1

		// These formulas probably suck but who cares
		return {
			nerf: Math.sqrt(2 * time + 1),
			buffLawyers: (evidence + 1) * Math.pow(1.1, Math.pow(evidence, 0.6)),
			buffEvidence: Math.pow(log, 3) * Math.pow(evidence + 1, 1 / 3),
			makeTime: 4 / Math.pow(log, 1.4),
			disappearTime: 3 / Math.pow(log, 0.4)
		}
	})

	function safeLog(num) {
		if (num < 0) return 0
		return Math.log10(num)
	}

	const trialProgress = computed(() => {
		// 1e100 eons
		const start = YEAR * 1e20
		const require = YEAR * 1e30 / start
		const curr = save.work / start

		return Math.max(Math.min(safeLog(curr) / safeLog(require), 1), 0)
	})

	const FORMATTER = {
		cash: (x, m) => m ? "$" + x : x + " Cash",
		evasionPoints: x => x + " Evasion",
		xp: x => x + " XP",
		energy: x => x + " Energy",
		experience: x => x + " Experience",
		strategies: x => x + " " + (x === 1 ? "strategy" : "strategies"),
		work: x => formatTime(x) + " of work",
		junk: x => x + " junk"
	}

	function canBuyUpgrade(id) {
		const upg = UPGRADES[id]

		// Check basics
		if (
			(upg.corp && save.upgrades[13] === 0) ||
			(upg.item && save.state < 8) ||
			(upg.lawyer && save.state < 9) ||
			!(upg.can?.value ?? true) ||
			!upg.show.value ||
			save.upgrades[id] >= upg.max
		) return false

		// Check costs
		for (const [name, value] of Object.entries(upg.cost)) {
			if (save[name] < unref(value)) return false
		}
		return true
	}

	function canRunAction(id) {
		const action = ACTIONS[id]
		if (action.mods?.sec) {
			for (const [mod, value] of Object.entries(action.mods.sec)) {
				if (unref(value) < 0 && save[mod] <= 0) return false
			}
		}

		return (action.can?.value ?? true) && (action.active?.value ?? true) && action.show.value
	}

	function buyUpgrade(id) {
		if (!canBuyUpgrade(id)) return

		for (const [name, value] of Object.entries(UPGRADES[id].cost)) {
			save[name] -= unref(value)
		}
		save.upgrades[id]++
	}

	function hireLawyer(id) {
		const lawyer = LAWYER_TIERS[id]
		const energyCost = 50 * (id + 1)
		if (save.cash < lawyer.cost.value || save.energy < energyCost) return
		save.cash -= lawyer.cost.value
		save.lawyers[id].bought++
		save.energy -= energyCost
	}

	// While loops are probably bad but who cares really
	function lawyerBuyMax() {
		while (true) {
			let idx = -1
			let cost = Infinity

			for (let i = 0; i < LAWYER_TIERS.length; i++) {
				const c = LAWYER_TIERS[i].cost.value
				if (save.cash >= c && save.energy >= 50 * (i + 1) && c < cost) {
					idx = i
					cost = c
				}
			}

			if (idx >= 0) hireLawyer(idx)
			else break
		}
	}

	const actionState = reactive(Array(ACTIONS.length).fill(0))

	const workerProds = computed(() => {
		let bonus = 1
		bonus *= Math.pow(1.15, save.upgrades[16])
		bonus *= Math.pow(1.15, save.upgrades[45])
		bonus *= Math.pow(1 + save.upgrades[44] * 0.01, save.upgrades[14])
		bonus *= lawyerEffects.value.multi

		return {
			cash: 30 * bonus,
			xp: 30 * bonus,
		}
	})

	const selfBoost = computed(() => {
		let boost = 1
		boost *= Math.pow(1.15, save.upgrades[37])
		if (save.upgrades[2] >= 1) boost *= 1.5
		if (save.upgrades[12] >= 1) boost *= 2
		return boost
	})

	const evasionGen = computed(() => {
		const d = save.timeSinceEscape
		let gen = 1

		gen *= d
		gen *= Math.pow(2, Math.floor(d / 30))

		gen /= Math.pow(2, save.upgrades[39])
		gen *= unref(ACTIONS[selected.value]?.mods?.mult?.evasionPoints) ?? 1
		gen /= UPGRADES[7].eff.value
		gen *= cashPenalty.value
		return gen
	})

	const maxEvadedPercentage = computed(() => {
		let cap = 1
		cap += UPGRADES[8].eff.value
		return cap
	})

	const maxEvasionPoints = computed(() => {
		return Math.pow(maxEvadedPercentage.value, 4) * 1e4
	})

	const realEvasionPoints = computed(() => Math.max(maxEvasionPoints.value - save.evasionPoints, 0))

	const evasionPercent = computed(() => {
		return Math.pow(realEvasionPoints.value, 0.25) / 10;
	})

	const energyCap = computed(() => {
		let cap = 100
		cap += 40 * save.upgrades[46]
		return cap
	})

	const passiveCash = computed(() => {
		let cash = 0
		cash += unref(ACTIONS[selected.value]?.mods?.sec?.cash) ?? 0
		cash *= unref(ACTIONS[selected.value]?.mods?.mult?.cash) ?? 1
		cash += save.upgrades[14] * workerProds.value.cash
		cash *= selfBoost.value
		cash *= Math.pow(1.25, save.upgrades[42])
		return cash
	})

	const cashPenalty = computed(() => {
		if (passiveCash.value < 10000) return 1
		// Is this too powerful?
		return Math.sqrt(passiveCash.value / 10000)
	})

	const passiveXP = computed(() => {
		let xp = 0
		xp += unref(ACTIONS[selected.value]?.mods?.sec?.xp) ?? 0
		xp += save.upgrades[14] * workerProds.value.xp
		xp *= selfBoost.value
		return xp
	})

	const passiveEnergy = computed(() => {
		let energy = 0
		energy += unref(ACTIONS[selected.value]?.mods?.sec?.energy) ?? 0
		energy *= unref(ACTIONS[selected.value]?.mods?.mult?.energy) ?? 1
		return energy
	})

	const actionSpeed = computed(() => {
		let speed = 1
		speed *= UPGRADES[11].eff.value
		return speed
	})

	const experienceGain = computed(() => {
		let gain = Math.pow(save.totalCash, 0.6)
		gain *= Math.pow(2, save.upgrades[41])
		gain *= Math.sqrt(save.strategies)

		return gain
	})

	const rawEnergy = computed(() => {
		let base = save.meals * 100 + save.upgrades[33] * 20
		base *= Math.pow(1.1, save.upgrades[36])

		// softcap beyond 2000 and 5000
		if (base > 2000) base = 2000 + (base - 2000) / 5
		if (base > 5000) base = 5000 + (base - 5000) / 10
		return base
	})

	const isPaused = computed(() => {
		return paused.value && save.evidence === 0
	})

	function evasionReset() {
		messages.push("The police caught up to you and sent you back to jail again. :( Better luck next time...")

		save.experience += experienceGain.value
		save.resetTimes++

		Object.assign(save, {
			timeSinceEscape: 0,
			state: 0,
			evasionPoints: 0,
			cash: 0,
			xp: 0,
			energySpent: 0,
			energy: 0,
			totalCash: 0,
			work: 0,
			meals: 0,
			junk: 0,
			tools: 0,
			lawyers: Array(LAWYER_TIERS.length).fill().map(() => ({
				bought: 0,
				produced: 0
			})),
			strategies: 0,
			strategySize: 5,
			startedTrial: false,
			trialTime: 0,
			evidence: 0,
			totalNerf: 1,
		})
		save.upgrades = save.upgrades.map((i, r) => {
			const upg = UPGRADES[r]
			if (!upg) return 0
			return upg.evasion || upg.research ? i : 0
		})
		selected.value = -1
		for (let i = 0; i < ACTIONS.length; i++) actionState[i] = 0
	}

	const paused = ref(DEV)

	function loop() {
		const now = Date.now()
		const diff = (now - save.lastTick) / 1000
		save.lastTick = now

		if (!isPaused.value && save.started) {
			if (trialProgress.value < 1) {
				save.playtime += diff

				save.energy = Math.min(Math.max(save.energy + passiveEnergy.value * diff, 0), energyCap.value)
				save.cash += passiveCash.value * diff
				save.totalCash += passiveCash.value * diff
				save.xp += passiveXP.value * diff

				if (selected.value >= 0) {
					const action = ACTIONS[selected.value]

					let okay = true
					for (const [mod, value] of Object.entries(action.mods?.sec ?? {})) {
						if (unref(value) < 0 && save[mod] <= 0) okay = false
					}

					if (!(action.active?.value ?? true) || !okay) {
						selected.value = -1
					} else {
						actionState[selected.value] = Math.min(actionState[selected.value] + actionSpeed.value * diff, action.time)

						if (actionState[selected.value] >= action.time) {
							action.finish?.()
							actionState[selected.value] = 0
							selected.value = -1
						}
					}
				} else if (save.upgrades[43] >= 1) {
					// Prioritize later actions
					for (let i = ACTIONS.length - 1; i >= 0; i--) {
						if (save.auto.actions[i] && canRunAction(i)) {
							selected.value = i;
							ACTIONS[i].start?.()
							break;
						}
					}
				}

				if (save.upgrades[13] >= 1) save.corporationUnlocked = true
				if (save.upgrades[23] >= 1) save.strategiesUnlocked = true

				if (puzzle0.attempted) {
					const div = 5 - 0.75 * puzzle0.count
					if (puzzle0.dir) {
						puzzle0.circle = Math.min(puzzle0.circle + diff / div, 0.98)
						if (puzzle0.circle === 0.98) puzzle0.dir = false
					} else {
						puzzle0.circle = Math.max(puzzle0.circle - diff / div, 0)
						if (puzzle0.circle === 0) puzzle0.dir = true
					}
				}

				if (save.upgrades[43] >= 1) {
					// Prioritize later upgrades
					for (let i = UPGRADES.length - 1; i >= 0; i--) {
						if (save.auto.upgrades[i] && canBuyUpgrade(i)) {
							buyUpgrade(i)
						}
					}
				}

				if (save.state >= 7) {
					save.evasionPoints += evasionGen.value * diff
					save.timeSinceEscape += diff

					const lowEnergy = save.energySpent >= rawEnergy.value && save.energy === 0
					if (lowEnergy) messages.push("You got too tired and then the police found you...")
					if (evasionPercent.value <= 0 || lowEnergy) evasionReset()
				}

				if (save.state >= 9) {
					for (let i = LAWYER_TIERS.length - 1; i >= 0; i--) {
						const prod = save.lawyers[i].bought * getLawyerMulti(i) * diff
						if (i > 0) save.lawyers[i].produced += prod
						else save.work += prod
					}
				}

				if (save.upgrades[0] >= 1 && save.energy <= 0) selected.value = 5

				if (save.upgrades[23] >= 1) {
					strategyTemp.reroll = Math.min(strategyTemp.reroll + diff, strategyData.value.reroll)
					if (autoAttempts.value > 0) {
						strategyTemp.auto.time += diff
						const total = Math.floor(strategyTemp.auto.time * autoAttempts.value)
						if (total > 0) {
							strategyTemp.auto.time -= total / autoAttempts.value

							const stack = strategyTemp.auto.stack
							const searched = strategyTemp.auto.searched

							for (let i = 0; i < total; i++) {
								// DFS!!!!
								// Take the current node and add it to found
								const node = stack.pop()

								if (node === strategyTemp.map.size ** 2 - 1) {
									generateMap()
									save.strategies += strategyGain.value
								}

								// You _could_ insert an undefined value but it doesn't actually matter because 0 items will be inserted
								if (!searched.has(node)) {
									searched.add(node)

									// Find all other nodes that haven't already been searched
									// Reverse otherwise it looks at them in the opposite order
									for (const next of (strategyTemp.map[node] ?? []).toReversed()) {
										if (!searched.has(next) && !stack.includes(next)) stack.push(next)
									}
								}
							}
						}
					}

					if (strategyTemp.reroll >= strategyData.value.reroll &&
						strategyTemp.auto.stack.length === 0 &&
						save.upgrades[49] >= 1) {
						generateMap()
						strategyTemp.reroll = 0
					}
				}

				if (save.autoLawyers && save.upgrades[52] >= 1 && save.state >= 9) lawyerBuyMax()

				if (save.startedTrial) {
					save.trialTime += diff
					evidenceTemp.time += diff
					if (evidenceTemp.time >= trialEffects.value.makeTime) {
						// Don't overflow if the user goes offline
						evidenceTemp.time = 0
						evidenceTemp.evidence.push({
							time: 0,
							left: Math.random(),
							top: Math.random(),
							rotate: Math.random(),
						})
					}

					evidenceTemp.evidence = evidenceTemp.evidence.filter(i => {
						i.time += diff
						return i.time < trialEffects.value.disappearTime
					})

					const nerf = trialEffects.value.nerf ** diff
					save.work /= nerf
					save.totalNerf *= nerf
				}
			} else endTime.value += diff
		}
		setTimeout(loop, 20)
	}

	const Tooltip = {
		props: {
			pos: String,
			tooltipAlign: String,
			textAlign: String,
			show: {
				type: Boolean,
				default: true
			}
		},
		// the pinnacle of copying code
		setup(props) {
			const PADX = 5;
			const PADY = 5;

			const hovered = ref(false);
			const time = ref(0);
			const content = ref(null);
			const tooltip = ref(null);
			let interval;
			let last;

			const style = computed(() => {
				// go away error
				if (content.value === null || tooltip.value === null) return {};

				const ts = Math.sin((time.value * Math.PI) / 2);
				const {
					pos,
					tooltipAlign,
					textAlign
				} = props;

				const contentRect = content.value.getBoundingClientRect();
				const tooltipRect = tooltip.value.getBoundingClientRect();

				let [dx, dy] = [0, 0];

				if (pos === "bottom") dy = contentRect.bottom + 8 * ts;
				else if (pos === "top") dy = contentRect.top - tooltipRect.height - 8 * ts;
				else if (pos === "left") dx = contentRect.left - tooltipRect.width - 8 * ts;
				else if (pos === "right") dx = contentRect.right + 8 * ts;

				if (pos === "left" || pos === "right") {
					if (tooltipAlign === "left" || tooltipAlign === "start")
						dy = contentRect.top;
					else if (tooltipAlign === "center")
						dy = contentRect.top + (contentRect.height - tooltipRect.height) / 2;
					else if (tooltipAlign === "right" || tooltipAlign === "end") {
						dy = contentRect.bottom - tooltipRect.height;
					}
				} else if (pos === "top" || pos === "bottom") {
					if (tooltipAlign === "left" || tooltipAlign === "start")
						dx = contentRect.left;
					else if (tooltipAlign === "center")
						dx = contentRect.left + (contentRect.width - tooltipRect.width) / 2;
					else if (tooltipAlign === "right" || tooltipAlign === "end") {
						dx = contentRect.right - tooltipRect.width;
					}
				}

				return {
					textAlign,
					top: Math.max(
							PADY,
							Math.min(window.innerHeight - tooltipRect.height - PADY, dy),
						) +
						window.scrollY +
						"px",
					left: Math.max(
							PADX,
							Math.min(window.innerWidth - tooltipRect.width - PADX, dx),
						) +
						window.scrollX +
						"px",
				};
			});

			onMounted(() => {
				interval = setInterval(() => {
					const now = Date.now();
					const diff = (now - last) / 500;
					last = now;

					if (hovered.value) time.value = Math.min(time.value + diff, 1);
					else time.value = 0;
				}, 50);

				// this is incredibly sketchy but it seems to work
				const {
					el
				} = getCurrentInstance().subTree.children[0].children[0];
				el.addEventListener("mouseenter", () => (hovered.value = true));
				el.addEventListener("mouseleave", () => (hovered.value = false));
				content.value = el;
			});

			onUnmounted(() => clearInterval(interval));

			return {
				hovered,
				style,
				tooltip
			}
		},
		template: `
		<slot name="content" />
		<Teleport to="#tooltips">
			<div v-if="hovered && show" ref="tooltip" class="tooltip-div" :style="style">
				<slot name="tooltip" />
			</div>
		</Teleport>
	`
	}

	const Popup = {
		template: `
		<Teleport to="#popups">
			<div class="popup">
				<slot />
			</div>
		</Teleport>
		`
	}

	const Escape = {
		setup() {
			return {
				save,
				escape: () => {
					save.started = true
					messages.push("You'll need to look for an exit...")
				}
			}
		},
		template: `
		<div v-if="!save.started" id="escape" class="center">
			<div>
				You were sent to jail for tax evasion and need to escape.<br />
				Note that the game may be paused in the settings, this might be helpful...<br />
				<button @click="save.started = true">Begin</button>
			</div>
		</div>`
	}

	const Action = {
		components: {
			Tooltip
		},
		props: {
			id: Number,
		},
		setup(props) {
			const action = ACTIONS[props.id]
			const otherStarted = computed(() => selected.value >= 0)
			const can = computed(() => canRunAction(props.id))

			const need = computed(() => {
				if (action.mods?.sec) {
					for (const [mod, value] of Object.entries(action.mods.sec)) {
						if (unref(value) < 0 && save[mod] <= 0) return mod
					}
				}

				return ""
			})

			function actionEffs(mods, sec) {
				const effs = []
				for (const [name, value] of Object.entries(mods)) {
					const factor = name === "evasionPoints" ? -1 : 1
					effs.push([FORMATTER[name](sec ? formatGain(unref(value)) : formatMult(unref(value)), false) + (sec ? "/sec" : ""), unref(value) * factor > 0])
				}
				return effs
			}
			return {
				save,
				unref,
				action,
				can,
				need,
				format,
				selected: computed(() => selected.value === props.id),
				otherStarted,
				actionEffs,
				actionSpeed,
				progress: computed(() => actionState[props.id] / action.time),
				click: () => {
					if (!can.value || otherStarted.value) return
					selected.value = props.id
					action.start?.()
				}
			}
		},
		template: `
			<Tooltip pos="right" tooltip-align="center" text-align="center" :show="action.mods !== undefined && action.show.value">
			<template #content>
				<div :class="[(can && !otherStarted) || selected ? 'can' : 'cant', action.show.value ? 'action' : null]" @click="click">
					<template v-if="action.show.value">
						<div class="spacey">
							<span>{{ action.name }}</span>
							<span>{{ format(action.time / actionSpeed) }}s</span>
						</div>
						<br class="line" />
						<div v-html="unref(action.desc)"></div>
						<div v-if="action.flavorDesc" class="small">{{ action.flavorDesc }}</div>
						<br />
						<div v-if="action.require" style="color: red">Requirement: {{ action.require }}</div>
						<div v-if="need" style="color: red">Need {{ need }}</div>
						<button v-if="save.upgrades[43] >= 1" class="auto" @click.stop="save.auto.actions[id] = !save.auto.actions[id]" :class="save.auto.actions[id] ? 'bought' : null">
							Auto
						</button>
						<div v-if="selected" class="small">(currently active)</div><br />
						<div class="progress bought" :style="{ width: 100 * progress + '%' }"></div>
					</template>
				</div>
			</template>
			<template #tooltip>
				<div v-if="action.mods">
					<div class="big">Action Effects</div>
					<template v-if="action.mods.sec">
					<div class="space-apart" :style="{color: eff ? 'green' : 'red'}" v-for="([desc, eff]) in actionEffs(action.mods.sec, true)">
						{{ desc }}
					</div>
					</template>
					<template v-if="action.mods.mult">
					<div class="space-apart" :style="{color: eff ? 'green' : 'red'}" v-for="([desc, eff]) in actionEffs(action.mods.mult, false)">
						{{ desc }}
					</div>
					</template>
				</div>
			</template>
			</Tooltip>
				`
	}

	const Upgrade = {
		components: {
			Tooltip
		},
		props: {
			id: Number,
		},
		setup(props) {
			const upg = UPGRADES[props.id]
			const can = computed(() => canBuyUpgrade(props.id))
			const reqs = computed(() => {
				const stuff = []
				for (const [name, value] of Object.entries(upg.cost)) {
					stuff.push(FORMATTER[name](format(unref(value)), true))
				}
				if (upg.require) stuff.push(upg.require)
				return formatList(stuff)
			})
			const amount = computed(() => save.upgrades[props.id])
			const bought = computed(() => amount.value >= upg.max)
			return {
				save,
				unref,
				upg,
				can,
				format,
				amount,
				reqs,
				bought,
				click: () => {
					if (!can.value) return
					buyUpgrade(props.id)
				}
			}
		},
		template: `
		<Tooltip pos="right" tooltip-align="center" text-align="center" :show="upg.effects !== undefined && upg.show.value">
			<template #content>
				<div :class="[can ? 'can' : (!bought ? 'cant' : null), bought ? 'bought' : null, upg.show.value ? 'action' : null]" @click="click">
					<template v-if="upg.show.value">
						<div class="spacey">
							<span>{{ upg.name }}</span>
							<span style="width: 1rem"></span>
							<span>{{ format(amount, 0) }} / {{ format(upg.max, 0) }}</span>
						</div>
						<div>{{ upg.desc }}</div>
						<div v-if="upg.flavorDesc" class="small">{{ upg.flavorDesc }}</div>
						<div style="color: red" v-if="reqs && !bought"><br />Requirement: {{ reqs }}</div>
						<div v-if="upg.effDesc" style="color: green">Effect: {{ upg.effDesc(upg.eff.value) }}</div>
						<button v-if="save.upgrades[43] >= 1" class="auto" @click.stop="save.auto.upgrades[id] = !save.auto.upgrades[id]" :class="save.auto.upgrades[id] ? 'bought' : null">
							Auto
						</button>
					</template>
				</div>
			</template>
			<template #tooltip>
				<div class="big">Upgrade Effects</div>
				<template v-if="upg.effects.good">
					<div class="space-apart" style="color: green" v-for="desc in upg.effects.good">
						{{ unref(desc) }}
					</div>
				</template>
				<template v-if="upg.effects.bad">
					<div class="space-apart" style="color: red" v-for="desc in upg.effects.bad">
						{{ unref(desc) }}
					</div>
				</template>
			</template>
		</Tooltip>
				`
	}

	const TheBar = {
		components: {
			Tooltip
		},
		setup() {
			return {
				evasion: evasionPercent,
				points: realEvasionPoints,
				cap: maxEvadedPercentage,
				gen: evasionGen,
				format,
				save
			}
		},
		template: `
			<Tooltip pos="bottom" tooltip-align="center" text-align="center" v-if="save.state >= 7">
				<template #content>
					<div id="bar" class="bar">
						<div class="progress" style="background-color: red; border-radius: 3rem" :style="{ width: 100 * Math.min(evasion / cap, 1) + '%' }"></div>
						<div class="center" style="height: 100%">
						<div>
							{{ format(points) }} (-{{ format(gen) }}/sec) Evasion<br />
							{{ format(evasion * 100) }}% / {{ format(cap * 100) }}% Evaded
							</div>
						</div>
					</div>
				</template>
				<template #tooltip>
					The police are after you! This bar represents how close they are to finding you. If the bar ever
					reaches 0%, you will be sent back to jail again. Evasion loss doubles every 30 seconds.
				</template>
			</Tooltip>
		`
	}

	const Inventory = {
		components: {
			Tooltip
		},
		setup() {
			return {
				save,
				format,
				formatGain,
				passiveCash,
				passiveXP,
				passiveEnergy,
				energyCap,
				experienceGain,
				rawEnergy
			}
		},
		template: `
		<div id="inventory">
			<div class="big">Resources</div>
			<Tooltip pos="right" tooltip-align="center" text-align="center">
				<template #content>
					<div class="space-apart" v-show="save.resetTimes > 0">{{ format(save.experience) }} (+{{ format(experienceGain) }}) Experience</div>
				</template>
				<template #tooltip>
					Experience you've gained through previous jailbreak attempts.
				</template>
			</Tooltip>
			<Tooltip pos="right" tooltip-align="center" text-align="center">
				<template #content>
					<div class="space-apart">{{ format(save.energySpent, 0) }} / {{ format(rawEnergy, 0) }} Total Energy</div>
				</template>
				<template #tooltip>
					Energy that you can gain through resting, increased by the amount of food you have. 
					You have {{ format(save.meals, 0) }} meals, and {{ format(save.upgrades[33], 0) }} candy bars.
					Total energy will be reduced past 2000 and 5000.
				</template>
			</Tooltip>
			<Tooltip pos="right" tooltip-align="center" text-align="center">
				<template #content>
					<div class="space-apart">{{ format(save.energy, 0) }} ({{ formatGain(passiveEnergy, 0) }}/sec) / {{ format(energyCap, 0) }} Energy</div>
				</template>
				<template #tooltip>
					Energy, used for performing actions. Obtained through resting.
				</template>
			</Tooltip>
			<Tooltip pos="right" tooltip-align="center" text-align="center">
				<template #content>
					<div class="space-apart">{{ format(save.junk, 0) }} Junk</div>
				</template>
				<template #tooltip>
					Junk that you found in the prison. Could be useful...
				</template>
			</Tooltip>
			<Tooltip pos="right" tooltip-align="center" text-align="center">
				<template #content>
					<div class="space-apart">\${{ format(save.cash) }} (+{{ format(passiveCash) }}/sec)</div>
				</template>
				<template #tooltip>
					You'll need money if you want to have a chance at escaping.
				</template>
			</Tooltip>
			<Tooltip pos="right" tooltip-align="center" text-align="center">
				<template #content>
					<div class="space-apart" v-show="save.state >= 7">{{ format(save.xp) }} (+{{ format(passiveXP) }}/sec) XP</div>
				</template>
				<template #tooltip>
					XP that you have.
				</template>
			</Tooltip>
		</div>
		`
	}

	const Puzzle0 = {
		components: {
			Popup
		},
		setup() {
			const exit = ref(false)

			const width = computed(() => {
				return 0.25 - 0.04 * puzzle0.count
			})

			function pry() {
				if (exit.value) return

				if (puzzle0.circle >= puzzle0.pos && (puzzle0.circle + 0.02) <= (puzzle0.pos + width.value)) {
					// win
					puzzle0.count++
					if (puzzle0.count === 5) {
						solvePuzzle0()
						puzzle0.attempted = false
						exit.value = true
					} else {
						puzzle0.circle = 0
						puzzle0.pos = random(0, 1 - width.value)
					}
				} else {
					puzzle0.attempted = false
					exit.value = true
				}
			}

			function reset() {
				puzzle0.count = 0
				exit.value = false
			}

			function listener(e) {
				if (e.key === " ") pry()
			}

			window.addEventListener("keypress", listener)
			onUnmounted(() => window.removeEventListener("keypress", listener))

			return {
				puzzle0,
				pry,
				width,
				exit,
				reset
			}
		},
		template: `
		<Popup v-if="puzzle0.attempted || exit">
				<div class="big">The Door</div>
				<div>
					The door that blocks your path to the outside isn't movable, so you'll need to pry it open.<br />
					Whenever the yellow area is in the green area, you can pry it open partially. You'll need to do this
					5 times in order to get the door open enough to escape. However, if the yellow area isn't in the green area
					and you attempt to pry it, all of your progress will be reset. Note that you can also press the space bar to pry
					as well.<br /><br />
					<div id="puzzle0">
						<div style="background-color: green" :style="{ left: puzzle0.pos * 100 + '%', width: width * 100 + '%' }"></div>
						<div style="width: 2%; background-color: ${DARKYELLOW}" :style="{ left: puzzle0.circle * 100 + '%'}"></div>
					</div>
					<button @click="pry">Pry ({{ puzzle0.count }} / 5)</button>
				</div>
				<button @click="reset" v-if="exit">Quit</button>
		</Popup>`
	}

	const Puzzle1 = {
		components: {
			Popup
		},
		setup() {
			const guess = ref(0)
			const exit = ref(false)
			const guesses = computed(() => {
				const c = puzzle1.code.toString().split("").map(i => Number(i))
				return puzzle1.guess.map(i => {
					const g = i.toString().split("").map(i => Number(i))
					return g.map((g, idx) => [g, g > c[idx] ? "red" : g === c[idx] ? "green" : DARKYELLOW])
				})
			})

			function submitGuess() {
				if (guess.value < 1000 || guess.value > 9999 || puzzle1.guess.length >= 5) return
				puzzle1.guess.push(guess.value)
				if (guess.value === puzzle1.code) solvePuzzle1()
				if (guess.value === puzzle1.code || puzzle1.guess.length >= 5) exit.value = true
				guess.value = 0
			}

			function reset() {
				puzzle1.guess = []
				puzzle1.attempted = false
			}

			function listener(e) {
				if (e.key === "Enter") submitGuess()
			}

			window.addEventListener("keypress", listener)
			onUnmounted(() => window.removeEventListener("keypress", listener))

			return {
				guess,
				guesses,
				submitGuess,
				puzzle1,
				exit,
				reset
			}
		},
		template: `
		<Popup v-if="puzzle1.attempted">
				<div class="big">Pin Pad</div>
				<div>
					In order to board the plane, you'll need a PIN number. The thing is, you forgot yours, so you'll
					need a way to find it.<br />
					The Pin Pad requires you to enter a 4 digit number representing the code. You have 5 attempts to guess
					this code, but for every code attempt, it will give you some information.<br />
					Each digit will be highlighted in <span style="color: red">red</span> if it was bigger than the corresponding digit in the code,
					<span style="color: green">green</span> if it was correct, and <span style="color: ${DARKYELLOW}">yellow</span> if it was smaller than the corresponding digit in the code.<br /><br />
					<div>
						<div v-for="(guess, id) in guesses">
						<div class="spacey" style="font-size: 1.5em">
							<div>Attempt {{ id + 1 }}.</div>
							<div>
								<span v-for="([num, status]) in guess" :style="{backgroundColor: status, color: 'black'}">{{ num }}</span>
							</div>
						</div>
						</div>
					</div>
					<div class="center">
						<input type="number" :min="1000" :max="9999" :step="1" v-model="guess" />
						<button style="margin: 0 0.5rem" @click="submitGuess">Submit Code</button>
					</div>
					<button @click="reset" v-if="exit">Quit</button>
				</div>
			</Popup>`
	}

	const Options = {
		components: {
			Popup
		},
		setup() {
			const fileHandler = ref(null)
			const saveStr = ref("")

			function clipboard() {
				navigator.clipboard.writeText(encode())
			}

			function exportFile() {
				const file = new Blob([encode()], {
					type: "text/plain"
				})
				const url = URL.createObjectURL(file)
				const a = document.createElement("a")
				a.href = url
				a.download = "Save - " + new Date().toGMTString() + ".txt"
				a.click()
				URL.revokeObjectURL(url)
			}

			function importString() {
				loadSave(saveStr.value)
				saveData.importSave = false
			}

			function loadModal() {
				fileHandler.value.click()
			}

			onMounted(() => {
				const handler = fileHandler.value
				handler.addEventListener("change", async () => {
					if (handler.files.length === 0) return
					const text = await handler.files[0].text()
					loadSave(text)
				})
			})

			return {
				saveGame,
				clipboard,
				exportFile,
				fileHandler,
				saveData,
				saveStr,
				importString,
				loadModal,
				paused
			}
		},
		template: `
		<Popup v-if="saveData.importSave">
			Import your save.<br />
			<input type="text" v-model="saveStr" />
			<button @click="importString">Import</button>
		</Popup>
		<input type="file" ref="fileHandler" accept=".txt" style="display: none" />
		<button @click="saveGame">Save</button>
		<button @click="clipboard">Export to clipboard</button>
		<button @click="exportFile">Export as file</button>
		<button @click="saveData.importSave = true">Import</button>
		<button @click="loadModal">Import from File</button>
		<button @click="saveData.hardReset = true">Wipe Save</button>
		<button @click="paused = !paused">{{ paused ? "Unpause" : "Pause" }} the game (or press "p")</button>
		`
	}

	function getIndex(cond) {
		return UPGRADES.map((item, i) => [item, i]).filter(i => i[0] && i[1] !== 31 && cond(i[0])).map(i => i[1])
	}

	const upgs = getIndex(i => !i.item && !i.evasion && !i.corp && !i.lawyer && !i.research)
	const items = getIndex(i => i.item)
	const evasion = getIndex(i => i.evasion)
	const corp = getIndex(i => i.corp)
	const lawyer = getIndex(i => i.lawyer)
	const research = getIndex(i => i.research)

	const Main = {
		components: {
			Action,
			Upgrade
		},
		setup() {
			return {
				save,
				ACTIONS,
				upgs,
				items
			}
		},
		template: `
		<div class="big">Actions</div>
		<div class="actions">
			<Action v-for="i in ACTIONS.length" :id="i - 1" :key="i" />
		</div>
			<br class="line" />
			<div class="big">Upgrades</div>
			<div class="actions">
				<Upgrade v-for="i in upgs" :id="i" :key="i" />
			</div>
		<template v-if="save.state >= 8">
			<br class="line" />
			<div class="big">Items</div><br />
			<div style="width: 100%">
				<div class="actions">
					<Upgrade v-for="i in items" :id="i" :key="i" />
				</div>
			</div>
		</template>`,
	}

	const EvasionMenu = {
		components: {
			Upgrade
		},
		setup() {
			return {
				save,
				evasionReset,
				experienceGain,
				format,
				evasion
			}
		},
		template: `
			<button style="background-color: red" @click="evasionReset">
				Start over for {{ format(experienceGain) }} Experience.
			</button>
			<br />
			<div>
				Use your experience from past jailbreak attempts to make your next attempt better.<br />
				You currently have {{ format(save.experience) }} Experience, increased by Cash{{ save.strategiesUnlocked ? " and Strategies" : ""}}.
			</div><br /><br />
			<div class="actions">
				<Upgrade v-for="i in evasion" :id="i" :key="i" />
			</div>
		`
	}

	const Messages = {
		setup() {
			const comp = ref(null)
			watch(messages, () => {
				comp.value?.lastElementChild?.scrollIntoView(false, {
					behavior: "smooth"
				})
			}, {
				flush: "post"
			})
			return {
				messages,
				comp
			}
		},
		template: `
		<div id="messages">
				<div class="big">Logs</div>
				<div style="overflow-y: auto; height: calc(100% - 4em)" ref="comp">
					<template v-for="message in messages">
						<br /><div>{{ message }}</div>
					</template>
				</div>
			</div>`
	}

	const Corporation = {
		components: {
			Upgrade,
			Action
		},
		setup() {
			return {
				corp,
				save,
				format,
				cashPenalty
			}
		},
		template: `
			<div v-if="cashPenalty > 1" style="color: red">
				Due to excess Cash gain, you need to commit tax evasion, 
				multiplying your Evasion loss by <span class="big">{{ format(cashPenalty) }}</span>.
			</div>
			<div class="big">Upgrades</div>
			<div class="actions">
				<Upgrade v-for="i in corp" :id="i" :key="i"/>
			</div>
		`
	}

	const StrategyGrid = {
		setup() {
			function isConnected(i) {
				return strategyTemp.map[strategyTemp.selected]?.includes(i) ?? false
			}

			function handleClick(i) {
				if (isConnected(i - 1)) strategyTemp.selected = i - 1
				if (i === strategyTemp.map.size ** 2) {
					generateMap()
					save.strategies += strategyGain.value
				}
			}

			function seperate(id) {
				return [id % strategyTemp.map.size, Math.floor(id / strategyTemp.map.size)]
			}

			function connectedLine(id, id2) {
				return (id === strategyTemp.selected && isConnected(id2)) ||
					(id2 === strategyTemp.selected && isConnected(id))
			}

			const width = computed(() => 3.6 * strategyTemp.map.size + "rem")
			const viewBox = computed(() => {
				const max = 20 * strategyTemp.map.size
				return `0 0 ${max} ${max}`
			})

			function reroll() {
				if (strategyTemp.reroll < strategyData.value.reroll) return
				generateMap()
				strategyTemp.reroll = 0
			}

			return {
				format,
				isConnected,
				handleClick,
				seperate,
				connectedLine,
				width,
				viewBox,
				strategy: strategyTemp,
				reroll,
				strategyData
			}
		},
		template: `
		<button @click="reroll" :class="strategy.reroll >= strategyData.reroll ? 'can' : 'cant'">
				Reroll Strategy ({{ format(strategy.reroll) }}s / {{ format(strategyData.reroll) }}s)<br />
				<span style="color: red">You will lose all progress on this Strategy!</span>
			</button><br /><br />
		<div class="center" :style="{width}" style="flex-wrap: wrap; position: relative">
					<div v-for="i in strategy.map.size ** 2" class="node center" :class="
						[i - 1 === strategy.selected 
							? 'bought' 
							: isConnected(i - 1) 
								? 'can' 
								: 'nodecant',
						strategy.auto.searched.has(i - 1) 
							? 'explored'
							: strategy.auto.stack.includes(i - 1)
								? 'next'
								: null
						]
					" @click="handleClick(i)">
						{{ i === 1
							? "Start" 
							: i === strategy.map.size ** 2
								? "End"
								: ""
						}}
					</div>
					<svg style="position: absolute; top: 0; left: 0; z-index: -100" :height="width" :width="width" :viewBox="viewBox">
						<template v-for="(paths, id) in strategy.map">
							<line 
								:x1="20 * (seperate(id)[0] + 0.5)" 
								:x2="20 * (seperate(id2)[0] + 0.5)" 
								:y1="20 * (seperate(id)[1] + 0.5)" 
								:y2="20 * (seperate(id2)[1] + 0.5)" 
								:stroke-opacity="connectedLine(id, id2) ? 0.5 : 0.15"
								v-for="id2 in paths" 
							/>
						</template>
					</svg>
			</div>`
	}

	const Trial = {
		setup() {
			const canStart = computed(() => save.work >= YEAR * 1e20 && save.strategies >= 3e6)

			function begin() {
				if (!canStart.value) return
				save.startedTrial = true
			}

			return {
				format,
				save,
				canStart,
				begin,
				trialEffects,
				trialProgress,
				evidence: computed(() => evidenceTemp.evidence)
			}
		},
		// 4.8 and 4.9 are magic numbers, DON'T TOUCH THEM
		template: `
		<template v-if="!save.startedTrial">
			Are you ready? This might be a while...
			<div class="center" style="width: 100%">
				<button @click="begin" :class="canStart ? 'can' : 'cant'">
					Contest your jail sentence in court<br />
					<span style="color: red">Requires 1e10 eons of work and 3e6 strategies</span>
				</button>
			</div>
		</template>
		<div style="position: relative; width: 100%; height: 100%" v-else>
				Due to being in trial, your work and work gain is /{{ format(trialEffects.nerf) }} per second.<br />
				You have {{ format(save.evidence) }} evidence, multiplying strategy gain by {{ format(trialEffects.buffLawyers) }} 
				and evidence gain by {{ format(trialEffects.buffEvidence) }}.<br />
				Click on a paperclip to obtain evidence. Note that the game may not be paused after you have obtained evidence.
				<br /><br />
				<div class="center" style="width: 100%">
				<div class="bar" style="height: 5rem; width: 80%">
					<div class="progress" style="background-color: green" :style="{ width: 100 * trialProgress + '%' }"></div>
					<div class="center" style="height: 100%">
						<div>
							Progress: {{ format(trialProgress * 100) }}%
						</div>
					</div>
				</div>
				</div>
				<img
					v-for="(evid, idx) in evidence"
					src="paperclip.svg" 
					class="evidence" 
					@click="evidence.splice(idx, 1); save.evidence += trialEffects.buffEvidence"
					:style="{
						top: 'calc(' + evid.top + '* (100% - 4.8rem))', 
						left: 'calc(' + evid.left + '* (100% - 4.9rem))',
						transform: 'rotate(' + 360 * evid.rotate + 'deg)'
					}" 
				/>
			</div>
		`
	}

	const lawyerNotify = computed(() => ({
		lawyer: LAWYER_TIERS.some((i, x) => save.cash >= i.cost.value && save.energy >= 50 * (x + 1)) || (save.upgrades[30] >= 1 && canBuyUpgrade(31)),
		upgrade: lawyer.some(i => canBuyUpgrade(i))
	}))
	const Lawyers = {
		components: {
			Upgrade,
			StrategyGrid,
			Trial
		},
		setup() {
			const prod = computed(() => save.lawyers[0].bought * getLawyerMulti(0))

			function change(inc) {
				save.strategySize += inc
				if (save.strategySize < 5 || save.strategySize > strategyData.value.size) {
					save.strategySize -= inc
				}
			}

			const tab = ref("lawyer")
			return {
				save,
				format,
				formatMult,
				formatTime,
				prod,
				LAWYER_TIERS,
				getLawyerMulti,
				hireLawyer,
				lawyerEffects,
				lawyer,
				tab,
				strategyData,
				strategyGain,
				formatMult,
				strategyEffect,
				autoAttempts,
				change,
				canBuyUpgrade,
				buyUpgrade,
				UPGRADES,
				strategy: strategyTemp,
				lawyerNotify,
				lawyerBuyMax
			}
		},
		template: `
		<div class="tabs">
			<button @click="tab = 'lawyer'" :class="lawyerNotify.lawyer ? 'notify' : null">Lawyers</button>
			<button @click="tab = 'upgrade'" :class="lawyerNotify.upgrade ? 'notify' : null">Upgrades</button>
			<button @click="tab = 'strategy'" v-if="save.upgrades[23] >= 1">Strategies</button>
			<button @click="tab = 'trial'" v-if="save.upgrades[23] >= 1">Trial</button>
		</div>
		<br class="line" />
		<div style="overflow: auto; height: calc(100% - 4.4rem)">
		<div v-if="tab === 'upgrade'" class="actions">
			<Upgrade v-for="i in lawyer" :id="i" :key="i" />
		</div>
		<template v-if="tab === 'lawyer'">
			You can hire different tiers of lawyers here, working similarly to Antimatter Dimensions. The first lawyer tier produces 
			seconds of work, but each tier after that produces the multiplier for the previous lawyer tier. You can see the produced 
			multiplier in the parenthesis, and you can also see how many you've hired next to it. Lawyers get a {{ formatMult(1.15) }}
			for every lawyer hired on its tier.<br /><br />
			Your lawyers have produced <span class="big">{{ formatTime(save.work) }} (+{{ formatTime(prod) }}/sec)</span> of work,
			giving a <span class="big">{{ formatMult(lawyerEffects.multi) }}</span> to worker productivity.<br />
			<button @click="lawyerBuyMax">
				Buy Max
			</button>
			<button v-if="save.upgrades[52] >= 1" @click="save.autoLawyers = !save.autoLawyers">
				Auto: {{ save.autoLawyers ? 'ON' : 'OFF' }}
			</button>
			<div v-for="(lawyer, idx) in LAWYER_TIERS" class="center spacey lawyer">
				<div style="width: 10rem">
					<div class="big">{{ lawyer.name }}</div>
					{{ formatMult(getLawyerMulti(idx)) }}
				</div>
				<div>
					{{ format(save.lawyers[idx].bought, 0) }} ({{ format(save.lawyers[idx].produced) }})
				</div>
				<button style="width: 10rem" @click="hireLawyer(idx)" :class="save.cash >= lawyer.cost.value && save.energy >= (50 * (idx + 1)) ? 'can' : 'cant'">
					Hire for \${{ format(lawyer.cost.value) }} and {{ format(50 * (idx + 1), 0)}} energy
				</button>
			</div>
		</template>
		<template v-if="tab === 'strategy'">
			Your objective here is to find a path from the Start node to the End node. A node will be highlighted
			if it is connected to the current node selected. 
			<template v-if="autoAttempts > 0">
				The blue nodes have already been searched, and the orange nodes are going to be searched for next.<br />
			</template>
			Good luck!<br /><br />
			You have {{ format(save.strategies, 0) }} strategies, giving a <span class="big">{{ formatMult(strategyEffect) }}</span> to all lawyers. 
			Solving this puzzle will give you {{ format(strategyGain, 0) }} strategies.<br />
			<template v-if="autoAttempts > 0">
				Auto-attempting {{ format(autoAttempts) }}/sec<br />
			</template>
			Current Strategy size: 
				<button @click="change(-1)" :class="save.strategySize > 5 ? 'can' : 'cant'">&larr;</button>
				{{ save.strategySize }}
				<button @click="change(1)" :class="save.strategySize < strategyData.size ? 'can' : 'cant'">&rarr;</button><br />
			<StrategyGrid v-if="strategy.map.size < 10" />
			<div v-else>
				Due to sheer laziness, you can no longer see the Strategy, but you will still gain strategies as normal.<br />
				Progress: {{ strategy.auto.searched.size }} / {{ strategy.map.size ** 2 }} ({{ format(strategy.auto.searched.size / strategy.map.size ** 2 * 100) }}% done)
			</div>
		</template>
		<Trial v-if="tab === 'trial'" />
		</div>`
	}

	const Research = {
		components: {
			Upgrade
		},
		setup() {
			return {
				save,
				research
			}
		},
		template: `
		You can buy more powerful and useful upgrades here.<br />
		<template v-if="save.resetTimes > 0">
			Note that due to the nature of Research upgrades, they are PERNAMENT and are kept across jail.<br />
		</template>
		<div class="actions">
			<Upgrade v-for="i in research" :id="i" :key="i" />
		</div>
		`
	}

	const Game = {
		components: {
			Action,
			Upgrade,
			TheBar,
			Inventory,
			Puzzle0,
			Puzzle1,
			Options,
			Main,
			Messages,
			EvasionMenu,
			Corporation,
			Lawyers,
			Research
		},
		setup() {
			const tab = ref("main")
			const mainNotify = computed(() => [...upgs, ...items].some(i => canBuyUpgrade(i)))
			const corpNotify = computed(() => corp.some(i => canBuyUpgrade(i)))
			const resetNotify = computed(() => evasion.some(i => canBuyUpgrade(i)))
			const researchNotify = computed(() => research.some(i => canBuyUpgrade(i)))
			const trueLawyerNotify = computed(() => lawyerNotify.value.lawyer || lawyerNotify.value.upgrade)
			return {
				save,
				tab,
				isPaused,
				mainNotify,
				corpNotify,
				resetNotify,
				researchNotify,
				trueLawyerNotify,
				endTime
			}
		},
		template: `
		<div id="game" v-if="save.started && endTime < 5" :style="{ opacity: 1 - endTime / 5}">
			<TheBar />
			<Inventory />
			<Puzzle0 />
			<Puzzle1 />
			<Messages />
			<div id="core">
				<div class="tabs">
					<button @click="tab='main'" :class="mainNotify ? 'notify' : null">Main</button>
					<button v-if="save.researchUnlocked" @click="tab='research'" :class="researchNotify ? 'notify' : null">Research</button>
					<button v-if="save.upgrades[13] >= 1" @click="tab='corp'" :class="corpNotify ? 'notify' : null">Main 2</button>
					<button v-if="save.state >= 9" @click="tab='lawyers'" :class="trueLawyerNotify ? 'notify' : null">Lawyers</button>
					<button v-if="save.resetTimes > 0" @click="tab='evasion'" :class="resetNotify ? 'notify' : null">Reset</button>
					<button @click="tab='settings'">Settings</button>
				</div>
				<div v-if="isPaused" class="big" style="color: red">The game is paused, go to the Settings to unpause.</div>
				<br class="line" />
				<div style="overflow-y: auto; height: calc(100% - 4.4rem); margin: 0 0.4rem">
					<Options v-if="tab === 'settings'" />
					<EvasionMenu v-if="tab === 'evasion'" />
					<Main v-if="tab === 'main'" />
					<Corporation v-if="tab === 'corp'" />
					<Lawyers v-if="tab === 'lawyers'" />
					<Research v-if="tab === 'research'" />
				</div>
			</div>
		</div>`
	}

	const End = {
		setup() {
			return {
				save,
				endTime,
				formatTime,
				saveData
			}
		},
		template: `
		<div class="center" id="end" v-if="endTime >= 5" :style="{ opacity: Math.min(endTime / 5 - 1, 1) }">
		<div style="width: 50%">
		<div class="big">Congratulations!</div>
		You overturned your jail sentence and finally escaped jail! It took you <b>{{ save.resetTimes }}</b> 
		failed attempts and {{ formatTime(save.playtime) }} to get here.<br /><br />
		Now you can finally go outside and live your life without worrying about the police coming for you. You're
		not quite sure what you're going to do with your workers, or the trillions of dollars that you have, but
		you think you'll worry about that later.<br />
		<button @click="saveData.hardReset = true">Play Again</button>
		</div>
		</div>
		`
	}

	const app = createApp({
		components: {
			Escape,
			Game,
			End,
			Popup
		},
		setup() {
			function hardReset(value) {
				Object.assign(save, defaultSave())
				saveData.hardReset = false
			}

			return {
				saveData,
				hardReset
			}
		},
		template: `
		<Escape />
		<Game />
		<End />
		<Popup v-if="saveData.hardReset">
			Are you sure you want to hard reset? This is <b>PERNAMENT</b> and cannot be reversed.<br />
			<button @click="hardReset" style="color: red">Yes</button>
			<button @click="saveData.hardReset = false">No</button>
		</Popup>`
	})

	window.addEventListener("keypress", e => {
		if (e.key === "p") paused.value = !paused.value
	})

	window.addEventListener("load", () => {
		app.mount("#app")
		document.getElementById("loading").remove()

		load()
		loop()
		autoSave()

		// Always make true for now just in case the bugs happen
		if (true && DEV) window.save = save
	})
})()