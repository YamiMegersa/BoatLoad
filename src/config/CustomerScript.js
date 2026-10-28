/**
 * CustomerScript — Story, NPC customer roster, ship names, base pay, and dialogue scripts for Days 1–7.
 */

export const CUSTOMER_SCRIPTS = {
  1: {
    day: 1,
    customerName: 'Old Walt Gunnet',
    customerRole: 'Grizzled Sea Dog',
    shipName: 'The Sorry Bastard',
    complaintShort: `"She's knackered."`,
    basePay: 400,
    bio: 'Peg-legged, half-deaf, smells like a tavern floor. Tutorial level.',
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
    complaintShort: `"She's in poor spirits."`,
    basePay: 600,
    bio: 'A former naval officer, immaculate manners, a body count in the dozens.',
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
    complaintShort: `"Everything's fucked."`,
    basePay: 700,
    bio: "Has lost eight fingers, each one to a different shipwright's incompetence. Or his own.",
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
    complaintShort: `"She's been through a trial."`,
    basePay: 900,
    bio: 'A priest with a drinking problem, a gambling problem and a church-robbing problem.',
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
    complaintShort: `"She needs sorting before Thursday."`,
    basePay: 900,
    bio: 'Charming, flirty, and widowed seven times. Every death was an accident.',
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
    complaintShort: `"She's seen action. From nobody."`,
    basePay: 1200,
    bio: 'Obviously a Navy admiral in a fake beard and a painted pigeon. Everyone in port knows. Nobody says.',
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
    complaintShort: `"This is your fault."`,
    basePay: 1300,
    bio: "Cold, gorgeous, and enjoying this. Her ship is wrecked, and she's pretty sure it's your fault.",
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
  return CUSTOMER_SCRIPTS[day] || CUSTOMER_SCRIPTS[1];
}

