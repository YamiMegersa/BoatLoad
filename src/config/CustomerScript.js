/**
 * CustomerScript — Story, NPC customer roster, ship names, base pay, voice profiles,
 * and dialogue scripts for Days 1–7.
 *
 * Voice clip pools (from `src/assets/audio/voices/*.mp3`):
 *   - MUMBLE: general conversational babble chained while dialogue text types out
 *   - SWEAR:  triggered when the typewriter encounters swear/curse words or frustrated complaints
 *   - GRUNT:  triggered on sighs, groans, "Arrr!", "Oi", or complaint openings
 */

export const VOICE_CLIP_POOLS = {
  mumble: [
    'GeorgeMems3',
    'GeorgeMenem2',
    'GeorgeMenems',
    'GeorgeMnems',
    'GeorgeMus',
    'GeorgeMus2',
    'GeorgeMus3',
    'BrandenMus',
    'BrandenMus2',
    'BrandonMems',
    'BrendanWaa',
    'BrendanWaa2',
    'Mus',
    'Mus-2'
  ],
  swear: [
    'Fuck',
    'FuckMe',
    'FuckMeWhyAmIdoingThis',
    'FuckThisShit',
    'FuckYou',
    'FuckThisIsBAdJame'
  ],
  grunt: [
    'Argh',
    'Aaaa',
    'Inhale',
    'InhaleExhale',
    'InhaleExhale-2'
  ]
};

export const CUSTOMER_SCRIPTS = {
  0: {
    day: 0,
    customerName: 'Barnaby Claw, Esq.',
    customerRole: 'Crab Clerk',
    shipName: 'Abandoned Scrap Skiff',
    spritePath: 'assets/npc/custom_npc.png',
    complaintShort: `"7,000 doubloons by Sunday."`,
    basePay: 0,
    bio: 'Dawn. A hangover, a ring, and a legal scroll nailed to the post by a crab.',
    voice: {
      synthType: 'crab',
      pitch: 1.22,
      pitchVariance: 0.14,
      charIntervalMs: 30,
      syllableStep: 2
    },
    lines: [
      `Divorce papers. Seven thousand doubloons by Sunday, or she takes the lot. Lovely wedding, by the way. You gave a speech. It was long.`,
      {
        name: 'You (Hungover Shipwright)',
        portrait: '<span class="pixel-icon icon-portrait-captain size-48"></span>',
        text: `I'm married?`,
        voice: {
          pitch: 0.96,
          pitchVariance: 0.04,
          charIntervalMs: 38,
          sliceDuration: 0.9,
          clips: ['BrandenMus', 'GeorgeMenem2']
        }
      },
      `To a siren. At the Drowned Rat. You wept. She didn't.`,
      `I've served the writ of divorce — it's nailed to the post on the island just after the dock meets land. Inspect it to read the terms of your impending ruin.`
    ]
  },
  1: {
    day: 1,
    customerName: 'Old Walt Gunnet',
    customerRole: 'Grizzled Sea Dog',
    shipName: 'The Sorry Bastard',
    spritePath: 'assets/npc/luc.png',
    complaintShort: `"She's knackered."`,
    basePay: 400,
    bio: 'Peg-legged, half-deaf, smells like a tavern floor. Tutorial level.',
    voice: {
      pitch: 0.78,
      pitchVariance: 0.05,
      charIntervalMs: 38,
      sliceDuration: 1.35,
      bassBoostDb: 4,
      clips: ['Mus', 'Mus-2', 'BrandenMus', 'GeorgeMnems', 'GeorgeMus2']
    },
    lines: [
      `Oi. You the shipwright? Christ, you look younger than my last infection.`,
      `She's knackered, my ship. Creaks, groans, leaks. Like my third wife, God rest her. Hell of a woman. Bit of a leaker.`,
      `Patch the bloody thing. I've got a hold full of fish. Legal fish. Mostly.`,
      `Don't tell my wife I was here. She's dead, but she'll find out.`
    ]
  },
  2: {
    day: 2,
    customerName: 'Captain Prudence Pennywhistle',
    customerRole: 'Posh Murderer',
    shipName: 'The Salty Duchess',
    spritePath: 'assets/npc/caelum.png',
    complaintShort: `"She's in poor spirits."`,
    basePay: 600,
    bio: 'A former naval officer, immaculate manners, a body count in the dozens.',
    voice: {
      pitch: 1.34,
      pitchVariance: 0.06,
      charIntervalMs: 30,
      sliceDuration: 0.85,
      bassBoostDb: -3,
      clips: ['GeorgeMenem2', 'GeorgeMenems', 'GeorgeMems3', 'GeorgeMus', 'GeorgeMus3']
    },
    lines: [
      `Good morning. I'm told you're the only yard in port that hasn't been burned down. Yet.`,
      `My ship is in poor spirits. My first mate says she's 'fucked'. I prefer 'poor spirits'. He is no longer my first mate.`,
      `Do restore her. Fail, and I shall wear your skin to the Governor's ball. Kidding. It would clash.`,
      `Do have a pleasant afternoon. I shall be murdering a man by the docks. Nothing personal. He owes me a shilling.`
    ]
  },
  3: {
    day: 3,
    customerName: 'Two-Fingers Quill',
    customerRole: 'Unlucky Pirate',
    shipName: "The Third Time's Cursed",
    spritePath: 'assets/npc/baraka.png',
    complaintShort: `"Everything's fucked."`,
    basePay: 700,
    bio: "Has lost eight fingers, each one to a different shipwright's incompetence. Or his own.",
    voice: {
      pitch: 1.08,
      pitchVariance: 0.14,
      charIntervalMs: 34,
      sliceDuration: 1.05,
      clips: ['BrendanWaa', 'BrendanWaa2', 'BrandonMems', 'BrandenMus2']
    },
    lines: [
      `Don't shake my hand. I haven't the fingers for it.`,
      `Everything's fucked. Every part of her. Mostly the parts.`,
      `"Eight fingers, I lost. Different days, different shipwrights. All dead now. Coincidence." (Stares.) "Fix her."`,
      `Off I go. Eight little fingers in a jar at home, waiting. Better company than my wife.`
    ]
  },
  4: {
    day: 4,
    customerName: 'Brother Ambrose',
    customerRole: 'Corrupt Priest',
    shipName: 'The Holy Plunder',
    spritePath: 'assets/npc/custom_npc.png',
    complaintShort: `"She's been through a trial."`,
    basePay: 900,
    bio: 'A priest with a drinking problem, a gambling problem and a church-robbing problem.',
    voice: {
      pitch: 0.72,
      pitchVariance: 0.04,
      charIntervalMs: 38,
      sliceDuration: 1.5,
      bassBoostDb: 5,
      echoDelay: 0.065,
      echoFeedback: 0.25,
      echoWet: 0.2,
      clips: ['BrandenMus', 'Mus', 'Mus-2', 'GeorgeMnems']
    },
    lines: [
      `Bless you, my child. And bless this den of thieves. Mostly the thieves.`,
      `The Lord sent me trials. Also the Navy sent me cannon fire. It's hard to tell the difference.`,
      `Fix her, and I'll absolve you of one sin. Choose wisely. I've heard you've got hundreds.`,
      `Go in peace, my child. I'm going to a brothel and a barrel of communion wine. The Lord provides.`
    ]
  },
  5: {
    day: 5,
    customerName: 'Salty Sue',
    customerRole: 'Serial Widow',
    shipName: 'The Black Widow',
    spritePath: 'assets/npc/custom_npc.png',
    complaintShort: `"She needs sorting before Thursday."`,
    basePay: 900,
    bio: 'Charming, flirty, and widowed seven times. Every death was an accident.',
    voice: {
      pitch: 1.24,
      pitchVariance: 0.07,
      charIntervalMs: 33,
      sliceDuration: 1.0,
      pitchSlide: 1.06,
      clips: ['GeorgeMenems', 'GeorgeMems3', 'BrandonMems', 'GeorgeMenem2']
    },
    lines: [
      `Afternoon, love. Sue. Widow. Seven times over. The sea's cruel.`,
      `My ships never last. Neither do my husbands. Funny, that. Anyway, she's a wreck, and I've a wedding Thursday.`,
      `Fix her sharpish. My fiancé's a lovely lad. He doesn't swim.`,
      `Lovely doing business. You're invited to the wedding Thursday. Bring a shovel. Not for any reason.`
    ]
  },
  6: {
    day: 6,
    customerName: 'Barnacle Bill',
    customerRole: 'Obvious Undercover Admiral',
    shipName: 'The Totally Legitimate Pirate Vessel',
    spritePath: 'assets/npc/custom_npc.png',
    complaintShort: `"She's seen action. From nobody."`,
    basePay: 1200,
    bio: 'Obviously a Navy admiral in a fake beard and a painted pigeon. Everyone in port knows. Nobody says.',
    voice: {
      pitch: 0.90,
      pitchVariance: 0.08,
      charIntervalMs: 34,
      sliceDuration: 1.15,
      bassBoostDb: 2,
      clips: ['BrandenMus', 'BrandenMus2', 'BrendanWaa', 'GeorgeMus', 'GeorgeMus3']
    },
    lines: [
      `"Arrr! Good morrow, me hearty. I'm a pirate. Observe my parrot." (Holds up a pigeon.) "Squawk."`,
      `She's seen action. From absolutely nobody. Pirate business. Nothing to do with the Admiralty. I've never been to a briefing.`,
      `Fix her sharpish and I'll pay double. Pirates are rich. Famously. Arrr.`,
      `Right, I'm off to my pirate hideout. It's a very pirate-y townhouse in Kensington. Ahem. Cave.`
    ]
  },
  7: {
    day: 7,
    customerName: 'Marguerite',
    customerRole: 'Your Siren Wife',
    shipName: 'The Lawsuit',
    spritePath: 'assets/npc/erin.png',
    complaintShort: `"This is your fault."`,
    basePay: 1300,
    bio: "Cold, gorgeous, and enjoying this. Her ship is wrecked, and she's pretty sure it's your fault.",
    voice: {
      pitch: 1.38,
      pitchVariance: 0.06,
      charIntervalMs: 33,
      sliceDuration: 1.1,
      sirenShimmerRatio: 1.012,
      echoDelay: 0.05,
      echoFeedback: 0.25,
      echoWet: 0.18,
      clips: ['GeorgeMems3', 'GeorgeMenem2', 'BrendanWaa2', 'BrandonMems', 'Aaaa']
    },
    lines: [
      `Hello, husband.`,
      `It was a lovely wedding. You were on the floor for most of it. The ship's a mess, so's my reputation, and both are your doing.`,
      `Fix her before the ink dries. Do it well, and I might go easy on the settlement. Do it badly, and I'll start with the dog.`,
      `Remember our wedding, husband? You swore to love me forever, then threw up on the priest. Romantic.`
    ]
  }
};

/**
 * Retrieve the customer script definition for a given day (defaults to Day 1).
 * @param {number} day
 */
export function getCustomerForDay(day) {
  if (day !== undefined && day !== null && CUSTOMER_SCRIPTS[day]) {
    return CUSTOMER_SCRIPTS[day];
  }
  return CUSTOMER_SCRIPTS[1];
}

