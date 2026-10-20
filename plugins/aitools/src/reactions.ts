/**
 * Clawd's reactions to what the person says to him: a compliment makes him blush, scolding, swearing or yelling makes
 * him mad, "love you" gets a wink and a "call me", "take a break" sends him to his hammock, and so on.
 *
 * reactionTo reads the person's prompt against an ordered list of phrases (no model, no tokens): the first rule with
 * a phrase that matches wins. A long prompt is read only at its start and end, where a remark to him usually sits, and
 * code, quotes and links in it are skipped. The poses are drawn here too, for mascot.ts to play like any other.
 */

import type { MascotPose } from '../types'
import { R, about, at, clawd, during, keyed, moved, n, pill, shade, swing, tf, tfk, zzz } from './rig'
import type { Pose } from './moments'

// ---- what he reacts to ----

/** What a reaction plays: a one-shot `pose` as the turn starts, and the pose he settles into once it ends. */
export type Reaction = { name: string; pose: MascotPose; after?: MascotPose }

export const REACTION: Readonly<Record<string, Reaction>> = {
  love: { name: 'love', pose: 'callMe' },
  roll: { name: 'roll', pose: 'roll' },
  highFive: { name: 'highFive', pose: 'highFive' },
  pat: { name: 'pat', pose: 'pat' },
  rest: { name: 'rest', pose: 'yawn', after: 'hammock' },
  night: { name: 'night', pose: 'wave', after: 'sleeping' },
  ship: { name: 'ship', pose: 'shipping' },
  dance: { name: 'dance', pose: 'dance' },
  scold: { name: 'scold', pose: 'mad' },
  compliment: { name: 'compliment', pose: 'blush' },
  laugh: { name: 'laugh', pose: 'laugh' },
  thanks: { name: 'thanks', pose: 'bow' },
  yelling: { name: 'yelling', pose: 'mad' },
  swear: { name: 'swear', pose: 'mad' },
  sheepish: { name: 'sheepish', pose: 'sheepish' },
  hello: { name: 'hello', pose: 'wave' },
}

/** How long before a reaction said in passing ("thanks", "hi", "nice") plays again. */
export const REACTION_COOLDOWN_MS = 5 * 60_000

/** Reactions asked for outright ("do a barrel roll", "take a break"): they play every time. */
const ASKED_FOR: ReadonlySet<string> = new Set(['love', 'roll', 'highFive', 'pat', 'rest', 'night', 'dance'])

/** Whether a reaction may play now, given when it last played. */
export function mayReact(r: Reaction, lastAt: number | undefined, now: number): boolean {
  return ASKED_FOR.has(r.name) || lastAt === undefined || now - lastAt >= REACTION_COOLDOWN_MS
}

/** Words that name him, for phrases said to him ("bad bot", "pats Clawd"). */
const HIM = String.raw`(?:you|u|ya|clawd|claude|him|buddy|the\s+(?:bot|crab|robot|ai))`
/** The ways of saying "you are". */
const YOU_ARE = String.raw`(?:you'?re|you\s+are|ur|u\s+r|you'?re\s+being|you\s+are\s+being)`
/** Words that soften or stress what follows ("so", "really", "such a"). */
const VERY = String.raw`(?:(?:so|such|really|very|truly|totally|absolutely|completely|just|pretty|super|freaking|fucking|damn|bloody|the|an?|my)\s+)*`

/**
 * The rules in the order they are tried. Earlier rules win where two would match: "love you" over a compliment, a
 * compliment over its swearing ("fucking awesome"), laughing and thanks over yelling ("HAHA", "THANK YOU"), and
 * yelling over a plain "that's wrong" said in capitals.
 */
export const RULES: readonly { reaction: string; phrases: readonly RegExp[] }[] = [
  {
    reaction: 'love',
    phrases: [
      /\b(?:i\s+)?(?:love|luv|wuv|adore)\s+(?:you|ya|u|ye|yah)\b(?!\s+to\b)/i,
      /\b(?:ily|ilysm|ilu|xoxo|mwah+|muah+|smooch(?:es)?)\b/i,
      /<3+|❤|💕|💖|💗|💘|💝|💞|😍|🥰|😘|😻|♥/u,
      /\bmarry\s+me\b|\bbe\s+my\s+(?:valentine|bf|gf|boyfriend|girlfriend|husband|wife|partner)\b|\byou\s+complete\s+me\b/i,
      /\b(?:i'?m|i\s+am)\s+(?:in\s+love\s+with|falling\s+for|crushing\s+on|smitten\s+with)\s+(?:you|u)\b/i,
      /\b(?:i\s+have|i'?ve\s+got|got)\s+a\s+crush\s+on\s+(?:you|u)\b|\bi\s+(?:really\s+)?(?:like|dig|fancy)\s+you\b/i,
      new RegExp(String.raw`\b${YOU_ARE}\s+${VERY}(?:cute|adorable|sweet|handsome|precious|cutest|favou?rite|bestie|best\s+friend|bff|everything|soulmate|sunshine)\b`, 'i'),
      /\b(?:call|text)\s+me\b|\bhmu\b|\b(?:date|kiss)\s+me\b|\bgo\s+out\s+with\s+me\b/i,
      /\b(?:bae|babe|sweetheart|sweetie|darling|cutie|my\s+love)\b/i,
    ],
  },
  {
    reaction: 'roll',
    phrases: [
      /\bbarrel[\s-]?rolls?\b/i,
      /\bdo\s+(?:a|some)\s+(?:flip|backflip|front\s?flip|somersault|cartwheel|spin|twirl|trick|pirouette|360|loop[\s-]the[\s-]loop|loop[\s-]de[\s-]loop)s?\b/i,
      /\b(?:back|front)[\s-]?flips?\b|\bsomersaults?\b|\bcartwheels?\b|\bloop[\s-]the[\s-]loop\b/i,
      /\b(?:spin|twirl)\s+(?:around|for\s+me)\b|\broll\s+over\b|\bshow\s+me\s+a\s+trick\b/i,
      /\bw+h?e{3,}\b/i,
    ],
  },
  {
    reaction: 'highFive',
    phrases: [
      /\b(?:high|hi)[\s-]?(?:five|5|fives)\b/i,
      /\bup\s+top\b|\bfist[\s-]?bumps?\b|\b(?:bump|pound)\s+it\b|\bgimme\s+(?:five|5|some\s+skin)\b|\bslap\s+(?:me\s+)?(?:five|some\s+skin)\b/i,
      /\bteam\s?work\b|\bwe\s+(?:did\s+it|make\s+a\s+(?:great|good)\s+team|nailed\s+it|crushed\s+it|killed\s+it)\b/i,
      /✋|🙌|👊|🤜|🤛|🖐/u,
    ],
  },
  {
    reaction: 'pat',
    phrases: [
      /\*\s*(?:pats?|pets?|head\s?pats?|hugs?|boops?|scritch(?:es)?|scratch(?:es)?|snuggles?|cuddles?|squeezes?|noogies?|ruffles?)\b[^*]{0,40}\*/i,
      new RegExp(String.raw`\b(?:pats?|pets?|hugs?|boops?|scritch(?:es)?|cuddles?|snuggles?|squeezes?)\s+${HIM}\b`, 'i'),
      /\bhead\s?pats?\b|\bwho'?s\s+a\s+good\b|\bgood\s+(?:boy|bot|robot|crab|clawd|claude|lil\s+guy|little\s+guy|buddy|pup|doggo)\b/i,
      /\b(?:big|virtual|sending|bear|group|warm)\s+hugs?\b|^(?:\(?hugs?\)?|boop|pat\s+pat|pet\s+pet)\b/i,
      /🤗|🫂/u,
    ],
  },
  {
    reaction: 'rest',
    phrases: [
      /\btake\s+(?:a|an|some)\s+(?:break|breather|nap|rest|load\s+off|vacation|holiday|day\s+off|long\s+weekend|siesta|power\s+nap|chill\s+pill|time\s+off)\b/i,
      /\btake\s+(?:five|ten|it\s+easy|the\s+(?:day|night|afternoon|rest\s+of\s+the\s+day)\s+off)\b/i,
      /\b(?:get|have|catch|grab)\s+(?:some|a\s+little|a\s+bit\s+of)\s+(?:rest|sleep|shut[\s-]?eye|z'?s|zzz+)\b/i,
      /\bgo\s+(?:to\s+sleep|rest|nap|take\s+a\s+nap|have\s+a\s+nap|lie\s+down|chill|relax|touch\s+grass)\b|\bgo\s+on\s+(?:a\s+)?(?:vacation|holiday|break)\b/i,
      /\b(?:you\s+)?(?:deserve|earned|need)\s+(?:a|some)\s+(?:break|rest|nap|vacation|holiday|breather|day\s+off|sleep)\b|\b(?:you'?ve|you\s+have)\s+earned\s+it\b/i,
      /\brest\s+(?:up|easy|your\s+(?:eyes|claws|head))\b|\bput\s+your\s+feet\s+up\b|\b(?:nap|siesta|break)\s+time\b|\bpower\s+nap\b/i,
      /\btime\s+(?:for\s+(?:a|your)\s+(?:break|nap|rest|siesta)|to\s+(?:rest|nap|relax|take\s+a\s+break))\b/i,
      /\byou\s+(?:look|seem|must\s+be|sound)\s+(?:so\s+|really\s+)?(?:tired|exhausted|sleepy|beat|worn\s+out)\b/i,
      /^(?:relax|chill|chill\s+out|rest|nap)\b[\s!.,]*$|\b(?:relax|chill),?\s+(?:clawd|claude|buddy|dude|bro|man)\b/i,
      /\bclock\s+out\b|\boff\s+the\s+clock\b|\bthat'?s\s+enough\s+(?:work\s+)?for\s+(?:now|today)\b/i,
    ],
  },
  {
    reaction: 'night',
    phrases: [
      /\bgood\s?night\b|\b(?:g'?night|nite|nighty?[\s-]?night|night\s+night|gn|gnight)\b|\bsweet\s+dreams\b|\bsleep\s+(?:well|tight|good)\b/i,
      /\b(?:going|heading|off|time)\s+(?:to|for)\s+bed\b|\bbed\s?time\b/i,
      /\b(?:off|done|out|finished)\s+for\s+(?:the\s+(?:day|night|evening)|today|tonight)\b|\b(?:signing|logging)\s+off\b/i,
      /\bcall(?:ing)?\s+it\s+a\s+(?:day|night)\b|\bsee\s+(?:you|ya|u)\s+(?:tomorrow|in\s+the\s+morning|tmrw|tmr)\b|\buntil\s+tomorrow\b/i,
      /\bthat'?s\s+(?:it|all)\s+for\s+(?:today|tonight)\b|\bwrap(?:ping)?\s+(?:it\s+)?up\s+for\s+(?:today|tonight|the\s+day)\b/i,
      /🌙|😴|🛌|💤/u,
    ],
  },
  {
    reaction: 'ship',
    phrases: [
      /\bship\s+(?:it|this|that)\b|\bshipit\b|\blet'?s\s+ship\b|\b(?:ready|time)\s+to\s+ship\b/i,
      /\blgtm\b|\blooks\s+good\s+to\s+me\b|\bsend\s+it\b|\b(?:merge|push|launch)\s+it\b|\bto\s+the\s+moon\b|\b(?:blast|lift)\s+off\b/i,
      /🚀/u,
    ],
  },
  {
    reaction: 'dance',
    phrases: [
      /\bdanc(?:e|es|ing)\b|\bboogie\b|\bbust\s+a\s+move\b|\b(?:let'?s|time\s+to)\s+(?:party|celebrate|groove)\b|\bparty\s+time\b/i,
      /\b(?:yay+|ya+y|yipp?ee+|woo+(?:hoo+)?|w[o0]{3,}t?|hooray|hurray|huzzah|lfg+|wahoo+|yahoo+|yee+haw+|yes{3,}|hell\s+(?:yes|yeah)|heck\s+(?:yes|yeah)|fuck\s+yes|fuck\s+yeah)\b/i,
      /\blet'?s\s+go{2,}\b|\blet'?s\s+go+!/i,
      /🎉|🥳|🕺|💃|🎶|🎵|🪩/u,
    ],
  },
  {
    reaction: 'scold',
    phrases: [
      /\bbad\s+(?:bot|boy|clawd|claude|robot|ai|crab|dog|computer|assistant|job|work)\b|\b(?:terrible|awful|horrible|lousy|crap|shit)\s+(?:job|work)\b/i,
      new RegExp(String.raw`\b${YOU_ARE}\s+${VERY}(?:stupid|dumb|useless|idiot|idiotic|moron|moronic|incompetent|hopeless|terrible|awful|worst|pathetic|garbage|trash|worthless|annoying|lazy|clueless|brain[\s-]?dead|ridiculous|a\s+joke|a\s+disaster|fired|killing\s+me)\b`, 'i'),
      /\b(?:stupid|dumb|useless|idiot|moron|imbecile|dimwit|numbskull|nitwit|halfwit|dumbass)\s+(?:bot|robot|ai|machine|clawd|claude|crab|thing|computer)\b/i,
      /\b(?:idiot|moron|imbecile|dumbass|dimwit|nitwit|halfwit|numbskull|bonehead|knucklehead)s?\b/i,
      /\b(?:i\s+)?hate\s+(?:you|u|this|it|that)\b|\bshut\s+up\b|\bstfu\b|\bscrew\s+you\b|\bgo\s+away\b|\bget\s+lost\b|\byou\s+suck\b|\b(?:this|that|it)\s+sucks\b|\bshame\s+on\s+you\b/i,
      /\bwhat'?s\s+wrong\s+with\s+you\b|\bwhat\s+is\s+wrong\s+with\s+you\b|\bwhat\s+were\s+you\s+thinking\b|\bare\s+you\s+(?:kidding|serious|stupid|insane|crazy|nuts|joking|blind)\b/i,
      /\bhow\s+(?:dare|could)\s+you\b|\bhow\s+many\s+times\b|\bi\s+(?:told|asked)\s+you\s+(?:not\s+to|to\s+not|already|before|twice|again)\b|\bi\s+said\s+(?:no|not|don'?t|stop)\b/i,
      /\bfor\s+the\s+(?:last|hundredth|millionth|tenth|third|second|fifth)\s+time\b|\byou\s+had\s+one\s+job\b|\bunacceptable\b|\bnot\s+acceptable\b/i,
      /\bstop\s+(?:it|that|doing\s+that|being\s+\w+)\b|\bknock\s+it\s+off\b|\bcut\s+it\s+out\b|\bpay\s+attention\b|\buse\s+your\s+(?:brain|head)\b|\bdo\s+better\b/i,
      /\babsolute\s+(?:trash|garbage|nonsense|disaster|rubbish)\b|\bno\s+no\s+no+\b|\bu+g+h+\b|\barg+h+\b|\bgr{2,}\b|\bsmh\b/i,
      /😡|😠|🤬|👎|🙄|💢/u,
    ],
  },
  {
    reaction: 'compliment',
    phrases: [
      /\b(?:good|great|nice|awesome|amazing|excellent|fantastic|terrific|brilliant|stellar|superb|outstanding|wonderful|solid|beautiful|incredible|phenomenal|impressive|lovely|top[\s-]notch|fabulous|marvell?ous|splendid|epic|killer|neat|sweet|sick|dope|cool|perfect|smart)\s+(?:job|work|stuff|one|catch|call|idea|thinking|effort|going|find|fix|move|answer|thought|save|eye|instinct|instincts|choice|solution)\b/i,
      /\bwell\s+done\b|\b(?:nailed|crushed|smashed|aced)\s+it\b|\byou\s+(?:killed|slayed|rocked|owned)\s+it\b/i,
      new RegExp(String.raw`\b${YOU_ARE}\s+${VERY}(?:best|awesome|amazing|great|brilliant|genius|smart|clever|incredible|wonderful|fantastic|legend(?:ary)?|star|rock\s?star|superstar|champ|champion|hero|wizard|magician|life\s?saver|beast|machine|goat|mvp|boss|king|queen|natural|pro|unstoppable|on\s+fire|killing\s+it|crushing\s+it|doing\s+(?:great|amazing|awesome|good|well)|good\s+at\s+this|the\s+man|the\s+bomb|cool|helpful|so\s+good)\b`, 'i'),
      /\byou\s+(?:rock|rule|deliver(?:ed)?|did\s+(?:great|amazing|awesome|good|well|it|a\s+(?:great|good|nice|fantastic|amazing|wonderful)\s+job))\b/i,
      /\b(?:kudos|bravo|brava|props\s+to\s+you|hats?\s+off|chef'?s\s+kiss|10\/10|ten\s+out\s+of\s+ten|top\s+marks|gold\s+star)\b/i,
      new RegExp(String.raw`\b(?:that'?s|this\s+is|that\s+is|it'?s|it\s+is|looks|works|worked|sounds|reads)\s+${VERY}(?:great|perfect|amazing|awesome|beautiful|brilliant|excellent|fantastic|incredible|wonderful|gorgeous|stunning|lovely|fabulous|superb|impressive|exactly\s+(?:right|it)|spot\s+on|flawless|magic(?:al)?|slick|elegant|genius|clever|sick|dope|fire|much\s+better|way\s+better|so\s+much\s+better|a\s+lot\s+better)\b`, 'i'),
      /\b(?:love|loving|luv)\s+(?:it|this|that|the\s+new|how\s+(?:you|it|this))\b|\b(?:exactly|precisely)\s+what\s+i\s+(?:wanted|needed|meant|asked\s+for|was\s+looking\s+for)\b/i,
      /\bworks?\s+(?:like\s+a\s+charm|perfectly|great|beautifully|flawlessly)\b|\bmuch\s+(?:better|improved|nicer|cleaner)\b|\b(?:way|a\s+lot|so\s+much|loads|tons)\s+better\b/i,
      /\bimpressive\b|\b(?:i'?m|i\s+am)\s+impressed\b|\bproud\s+of\s+you\b|\byou\s+make\s+me\s+proud\b|\b(?:outdone|outdid)\s+yourself\b/i,
      /\bbest\s+(?:bot|ai|assistant|crab|clawd|claude|coder|programmer|engineer|teammate|partner|helper|buddy)(?:\s+ever)?\b/i,
      /\b(?:you'?ve|you\s+have)\s+been\s+(?:so\s+|really\s+|very\s+|super\s+)?(?:helpful|great|amazing|awesome|a\s+(?:big\s+|huge\s+|great\s+)?help)\b/i,
      /^(?:(?:oh\s+)?(?:wow|whoa|woah|omg|holy\s+(?:cow|moly|smokes))[\s,!.]+)?(?:nice|perfect|awesome|amazing|excellent|brilliant|beautiful|fantastic|wonderful|incredible|great|sweet|cool|neat|splendid|superb|stellar|outstanding|lovely|gorgeous|stunning|sick|dope|rad|legend(?:ary)?|genius|marvell?ous|flawless|magnificent|wicked|fabulous|terrific|phenomenal|beaut(?:y|iful)?)\b(?![\s,.!-]*(?:but|however|except|although|though)\b)/i,
      /\b(?:great|good|nice|perfect|excellent|awesome|amazing|beautiful)!+/i,
      /👏|👍|💯|🔥|⭐|🌟|✨|😎|🤩|🏆|🥇|👌/u,
    ],
  },
  {
    reaction: 'laugh',
    phrases: [
      /\bl(?:o+l+)+\b|\blmf?ao+\b|\brofl(?:mao)?\b|\blulz?\b|\bkek\b|\bxd+\b|\bded\b/i,
      /\b(?:h+a+){2,}h*\b|\b(?:a+h+){2,}a*\b|\b(?:h+e+){2,}h*\b|\bha+h\b|\bha+!|\bbwa+h?(?:ha+)+\b|\bmua?h(?:ha+)+\b/i,
      /\bhilarious\b|\b(?:so|too|very)\s+funny\b|\b(?:that'?s|you'?re|this\s+is)\s+(?:so\s+)?funny\b|\bcracking\s+me\s+up\b|\bi'?m\s+(?:dying|dead|crying)\b|\bi\s+can'?t\s+breathe\b/i,
      /😂|🤣|😆|😹|😄|😁/u,
    ],
  },
  {
    reaction: 'thanks',
    phrases: [
      /\bthanks?\b|\bthank\s+(?:you|u|ya|ye)\b|\b(?:thx|thnx|thnks|tnx|tks|ty|tyvm|tysm|tyty|thankies|thanku)\b/i,
      /\b(?:danke|merci|gracias|grazie|arigato|obrigad[oa]|spasibo|cheers)\b/i,
      /\bmuch\s+(?:obliged|appreciated)\b|\bmany\s+thanks\b|\b(?:i\s+)?appreciate\s+(?:it|you|that|this|the\s+help)\b|\bappreciated\b/i,
      /\byou'?re\s+a\s+(?:gem|treasure|doll|godsend)\b|\bowe\s+you\s+(?:one|a\s+(?:beer|coffee|drink|lot))\b|\bbless\s+you\b/i,
      /🙏|🙇/u,
    ],
  },
  { reaction: 'yelling', phrases: [] },
  {
    reaction: 'swear',
    phrases: [
      /\b(?:fuck(?:ing|in'?|ed|er|s)?|f+u+c+k+|fck|fking|fkn|fk|shit(?:ty|s)?|bullshit|horseshit|shite|crap(?:py)?|damn(?:it)?|dammit|god\s?damn(?:it)?)\b/i,
      /\b(?:wtf|wth|ffs|omfg|jfc|hell|piss(?:ed)?|bitch|asshole|arsehole|bastard|bollocks|bugger|douche(?:bag)?|jackass|motherfucker|frick(?:ing)?|freaking|friggin[g']?|dang\s+it|darn\s+it)\b/i,
      /\bsh[*!]t\b|\bf[*]+(?:c?k)?\b|\bf[*u][*c]k/i,
      /😤|🖕/u,
    ],
  },
  {
    reaction: 'sheepish',
    phrases: [
      /\b(?:are|r)\s+(?:you|u)\s+(?:sure|certain|positive|confident)\b/i,
      /\b(?:that'?s|this\s+is|that\s+is|it'?s|it\s+is|you'?re|you\s+are)\s+(?:(?:still|just|totally|completely|clearly|obviously|definitely|so|all)\s+)*(?:wrong|incorrect|not\s+(?:right|correct|it|what\s+i\s+(?:asked|wanted|meant|said))|broken|backwards|a\s+bug|a\s+mistake|hallucinating|making\s+(?:things|stuff|that|it)\s+up|confused|mistaken)\b/i,
      /\b(?:you|u)\s+(?:broke|deleted|removed|wiped|nuked|messed\s+up|screwed\s+up|missed|forgot|ignored|skipped|misread|misunderstood|hallucinated|got\s+(?:it|that|this)\s+wrong|made\s+(?:that|this|it|things|stuff)\s+up|made\s+a\s+(?:mistake|typo|mess)|didn'?t\s+(?:listen|read|do|test|check|run|follow))\b/i,
      /\b(?:that|it|this)\s+(?:still\s+)?(?:didn'?t|did\s+not|doesn'?t|does\s+not|won'?t|isn'?t)\s+(?:work|working|compile|build|run|help|make\s+sense|pass|load|fix\s+(?:it|anything|the\s+\w+))\b/i,
      /\b(?:still|again)\s+(?:broken|failing|not\s+working|wrong|crashing|the\s+same|doesn'?t\s+work)\b|\bnothing\s+(?:changed|happened)\b/i,
      /\btry\s+again\b|\bthat'?s\s+not\s+it\b|\bnot\s+quite\b|\bnot\s+even\s+close\b|\bwhoops\b|\boops\b|\buh[\s-]?oh\b|\byikes\b|\boh\s+no\b/i,
      /^(?:no+|nope|wrong|incorrect|nah|uh,?\s+no)\b[\s.,!]*(?:$|that|it|this|you)/i,
      /\bwhy\s+(?:did|would)\s+(?:you|u)\b|\byou\s+(?:were|are)\s+supposed\s+to\b|\b(?:didn'?t|did\s+not)\s+i\s+(?:say|tell\s+you|ask)\b/i,
      /😅|🤦|😬|🫠|🤨/u,
    ],
  },
  {
    reaction: 'hello',
    phrases: [
      /^(?:hi|hello|hey|heya|hiya|howdy|yo|sup|hai|hullo|ahoy|greetings|salutations|aloha|hola|bonjour|ciao|g'?day|morning|evening|afternoon|good\s+(?:morning|afternoon|evening|day)|what'?s\s+up|wh?a+ssu+p|whaddup|top\s+of\s+the\s+morning)\b/i,
      /\b(?:bye|bye[\s-]bye|bye+|goodbye|good\s+bye|cya|see\s+(?:ya|you|u)(?:\s+(?:later|soon|around))?|laters|ttyl|ttfn|take\s+care|farewell|peace\s+out|adios|au\s+revoir|toodles|ta[\s-]ta|catch\s+you\s+later|so\s+long)\b[\s!.]*$/i,
      /\bnice\s+to\s+meet\s+you\b|\bhow\s+(?:are|r)\s+(?:you|u|ya)(?:\s+doing)?\s*\?|\b(?:i'?m|i\s+am)\s+back\b|\bwave\s+(?:at|to|for)\s+me\b|\bsay\s+(?:hi|hello)\b/i,
      /👋|🙋/u,
    ],
  },
]

/** A prompt this many words or fewer is read whole; a longer one only at its first and last WINDOW words. */
export const WHOLE = 24
export const WINDOW = 12

/** What the person typed, without the code, quotes, pasted text and links in it, spaced plainly. */
export function said(text: string): string {
  return text
    .replace(/<(pasted_content|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/\bhttps?:\/\/\S+/g, ' ')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The stretches of what was said that phrases are read in: all of it, or its start and its end. The ellipses keep a
 * phrase that must start or end the prompt from matching where a stretch was cut.
 */
export function stretches(s: string): string[] {
  const words = s.split(' ')
  if (words.length <= WHOLE) {
    return [s]
  }
  return [words.slice(0, WINDOW).join(' ') + ' …', '… ' + words.slice(-WINDOW).join(' ')]
}

/** Yelling: three words or more, eight letters or more, nearly all of them capitals. */
export function isYelling(s: string): boolean {
  const letters = s.match(/\p{L}/gu) ?? []
  const upper = letters.filter(c => c !== c.toLowerCase()).length
  const wordy = s.split(' ').filter(w => /\p{L}{2,}/u.test(w)).length

  return wordy >= 3 && letters.length >= 8 && upper / letters.length >= 0.8
}

/** How Clawd reacts to the person's prompt, if he does; a slash command gets nothing. */
export function reactionTo(text: string): Reaction | null {
  if (/^\s*\//.test(text)) {
    return null
  }
  const s = said(text)
  if (!s) {
    return null
  }
  const parts = stretches(s)
  for (const rule of RULES) {
    const isHit = rule.reaction === 'yelling' ? isYelling(s) : rule.phrases.some(p => parts.some(part => p.test(part)))
    if (isHit) {
      return REACTION[rule.reaction] ?? null
    }
  }

  return null
}

// ---- how he reacts ----

const PAGE = '#F6F0E4'
const YELLOW = '#F2C14E'
const AMBER = '#E8B04B'
const BLUE = '#6CA0DC'
const RED = '#E0524C'
const STEEL = '#9A9893'
const SWEAT = '#7CC4E8'
const HEART = '#E8697D'
const BLUSH = '#F28B9A'
const SKIN = '#E8C9A0'
const WOOD = '#9C7650'
const CANVAS = '#6CA0DC'
/** His colour flushed red, mad. */
const FLUSHED = '#DC5F45'

/** A heart about (0, 0), 3 across. */
const heart = (c = HEART) => `<path d="M0 1.1C-2.3 -0.3 -1.3 -2.1 0 -0.85C1.3 -2.1 2.3 -0.3 0 1.1z" fill="${c}"/>`

/** A four-point star about (0, 0). */
const star = (c = YELLOW, s = 1) =>
  `<path d="M0 ${-1.4 * s}Q${0.15 * s} ${-0.15 * s} ${1.4 * s} 0Q${0.15 * s} ${0.15 * s} 0 ${1.4 * s}Q${-0.15 * s} ${0.15 * s} ${-1.4 * s} 0Q${-0.15 * s} ${-0.15 * s} 0 ${-1.4 * s}z" fill="${c}"/>`

/** A drop, its tip at (0, -s). */
const drop = (s = 0.7, c = SWEAT) =>
  `<path d="M0 ${-s}Q${n(s * 0.7)} 0 ${n(s * 0.55)} ${n(s * 0.35)}A${n(s * 0.55)} ${n(s * 0.55)} 0 0 1 ${n(-s * 0.55)} ${n(s * 0.35)}Q${n(-s * 0.7)} 0 0 ${-s}z" fill="${c}"/>`

/** An eighth note about (0, 0). */
const note = (c: string) =>
  `<ellipse cx="0" cy="0.7" rx="0.6" ry="0.45" fill="${c}" transform="rotate(-20 0 0.7)"/>` + pill(0.38, -1.3, 0.24, 2, c, 0.1) + `<path d="M0.6 -1.3Q1.5 -0.9 1.3 0" fill="none" stroke="${c}" stroke-width="0.3" stroke-linecap="round"/>`

/**
 * `shape` at (x, y) popping in at `from` of each `dur` ms cycle, then rising `rise` and drifting `dx` as it fades out
 * by `to`.
 */
function rising(x: number, y: number, dur: number, from: number, to: number, shape: string, dx = 0.6, size = 1, rise = 2.6): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)})"><g opacity="0">` +
    keyed('opacity', [[0, 0], [from, 0], [from + 0.03, 1], [to - 0.08, 1], [to, 0], [1, 0]], dur) +
    moved(
      tfk('translate', [[0, '0 0'], [from, '0 0'], [to, `${n(dx)} ${n(-rise)}`], [1, `${n(dx)} ${n(-rise)}`]], dur),
      moved(tfk('scale', [[0, '0'], [from, '0'], [from + 0.05, n(size * 1.25)], [from + 0.09, n(size)], [1, n(size)]], dur), shape),
    ) +
    '</g></g>'
  )
}

/** Content shown from `from` of each cycle, popping in and fading out by `to`, without moving. */
function popping(x: number, y: number, dur: number, from: number, to: number, shape: string): string {
  return rising(x, y, dur, from, to, shape, 0, 1, 0)
}

// The compliment: cheeks flush pink, eyes squeeze happy, and he sways shyly as a heart pops up and floats away.

const BLUSH_MS = 3000

function blushing(): string {
  const C = BLUSH_MS
  const cheeks = [8.25, 15.75]
    .map(cx => `<ellipse cx="${cx}" cy="8.6" rx="1" ry="0.55" fill="${BLUSH}" opacity="0">${keyed('opacity', [[0, 0], [0.1, 0], [0.24, 0.95], [0.9, 0.95], [1, 0]], C)}</ellipse>`)
    .join('')
  const shy = tfk('rotate', [[0, '0 12 12'], [0.15, '0 12 12'], [0.3, '-4 12 12'], [0.48, '3 12 12'], [0.66, '-4 12 12'], [0.84, '2 12 12'], [1, '0 12 12']], C)
  const him = clawd({ liftL: -50, liftR: -50, moods: [['open', C * 0.12, 0], ['happy', C * 0.88, 0.25]] })
  const hearts = rising(20.4, 5, C, 0.2, 0.75, heart()) + rising(18.6, 3.6, C, 0.42, 0.95, heart(), 0.9, 0.6)

  return moved(shy, him + cheeks) + hearts
}

// Scolded, sworn at or yelled at: flushed red, angry brows, fists shaking, a foot stomping, steam and an anger mark.

const MAD_MS = 2800

/** A puff of steam jetting from (x, y) toward (dx, dy), swelling and fading every `dur` ms from `begin`. */
const steam = (x: number, y: number, dx: number, dy: number, dur: number, begin: number) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="0.4" fill="${PAGE}" opacity="0">` +
  `<animate attributeName="opacity" values="0;0.95;0" keyTimes="0;0.15;1" dur="${dur}ms" begin="${begin}ms" repeatCount="indefinite"/>` +
  `<animate attributeName="r" values="0.4;1.2" dur="${dur}ms" begin="${begin}ms" repeatCount="indefinite"/>` +
  tf('translate', ['0 0', `${n(dx)} ${n(dy)}`], dur, { begin, ease: '0.2 0.6 0.4 1' }) +
  '</circle>'

/** The four ticks of an anger mark about (0, 0). */
const vein = () =>
  [0, 90, 180, 270].map(r => `<path d="M0.35 -1.15Q0.35 -0.35 1.15 -0.35" fill="none" stroke="${RED}" stroke-width="0.42" stroke-linecap="round" transform="rotate(${r})"/>`).join('')

function mad(): string {
  const shake = tf('translate', ['0 0', '-0.25 0', '0.25 0', '0 0'], 160)
  const him = clawd({ color: FLUSHED, eyes: 'angry', liftL: 35, liftR: 35, armL: swing('L', -30, 260), armR: swing('R', -30, 260, { begin: 130 }), tap: 280 })
  const mark = about(19.6, 4.2, tf('scale', ['1', '1.3', '1'], 460), at(19.6, 4.2, vein()))
  const puffs = [0, 300, 600].map(b => steam(7.8, 5.6, -2.6, -2.2, 900, b) + steam(16.2, 5.6, 2.6, -2.2, 900, b + 150)).join('')

  return puffs + moved(shake, him) + mark
}

// "Love you": a red phone held up to his head, a wink, the phone wiggling "call me", hearts floating off it.

const CALL_MS = 3600

/** A phone handset, upright about (0, 0): its two cups to the left, its handle bowed to the right, its cord coiling down. */
const handset = () =>
  `<path d="M0 2.2q0.55 0.35 0 0.7q-0.55 0.35 0 0.7q0.55 0.35 0 0.7q-0.55 0.35 0 0.7" fill="none" stroke="${shade(RED, 0.2)}" stroke-width="0.28" stroke-linecap="round"/>` +
  `<path d="M0.2 -1.5Q1.3 0 0.2 1.5" fill="none" stroke="${RED}" stroke-width="0.95" stroke-linecap="round"/>` +
  pill(-0.95, -2.35, 1.7, 1.15, RED, 0.5) +
  pill(-0.95, 1.2, 1.7, 1.15, RED, 0.5)

function callMe(): string {
  const C = CALL_MS
  const wiggle = tf('rotate', [R(0), R(-7), R(0), R(5), R(0)], 700)
  const him = clawd({ liftL: -30, liftR: 30, armR: wiggle, moods: [['open', C * 0.2, 0.25], ['wink', C * 0.55, 0.25], ['happy', C * 0.25, 0.25]] })
  const phone = `<g transform="rotate(-30 16.7 7.5)"><g>${wiggle}<g transform="translate(19.5 7.5) rotate(20)">${handset()}</g></g></g>`
  const sway = tf('rotate', ['-2 12 12', '2 12 12', '-2 12 12'], 1800)
  const hearts = rising(21.6, 4.6, C, 0.25, 0.7, heart(), 0.7, 0.6) + rising(22.6, 6.4, C, 0.45, 0.9, heart(), 0.9, 0.5) + rising(20.6, 3, C, 0.62, 0.98, heart(), 0.5, 0.45)

  return moved(sway, him + phone) + hearts
}

// "Do a barrel roll": a crouch, a leap, a full spin in the air, a landing with arms up and stars.

const ROLL_MS = 2400

function rolling(): string {
  const C = ROLL_MS
  const jump = tfk('translate', [[0, '0 0'], [0.16, '0 0'], [0.34, '0 -1.2'], [0.5, '0 -1.2'], [0.64, '0 0'], [1, '0 0']], C)
  const spin = tfk('rotate', [[0, '0 12 8.5'], [0.2, '0 12 8.5'], [0.6, '360 12 8.5'], [1, '360 12 8.5']], C, { ease: '0.4 0 0.6 1' })
  const squash = tfk('scale', [[0, '1 1'], [0.08, '1.08 0.88'], [0.18, '0.94 1.08'], [0.26, '0.72 0.72'], [0.56, '0.72 0.72'], [0.64, '1 1'], [0.7, '1.1 0.86'], [0.78, '1 1'], [1, '1 1']], C)
  const spinning = clawd({ eyes: 'wide', liftL: 25, liftR: 25 })
  const landed = clawd({ eyes: 'happy', liftL: 65, liftR: 65 })
  const swoosh = during(
    `<path d="M5.6 4.4A7 7 0 0 1 18.4 4.4M18.4 12.6A7 7 0 0 1 5.6 12.6" fill="none" stroke="${STEEL}" stroke-width="0.35" stroke-linecap="round" stroke-dasharray="2 1.2"/>`,
    0.26,
    0.56,
    C,
  )
  const stars = popping(4.5, 5, C, 0.7, 0.98, star()) + popping(19.8, 4.2, C, 0.74, 0.98, star(AMBER, 0.8))
  const figure = moved(jump, moved(spin, about(12, 12, squash, during(spinning, 0, 0.7, C) + during(landed, 0.7, 1, C))))

  return swoosh + figure + stars
}

// "Thanks": a little bow, eyes closed, and a sparkle as he comes back up smiling.

const BOW_MS = 2600

function bowing(): string {
  const C = BOW_MS
  const dip = tfk('scale', [[0, '1 1'], [0.15, '1 1'], [0.32, '1.03 0.8'], [0.6, '1.03 0.8'], [0.74, '1 1'], [1, '1 1']], C)
  const eyesDown = tfk('translate', [[0, '0 0'], [0.15, '0 0'], [0.32, '0 0.7'], [0.6, '0 0.7'], [0.74, '0 0'], [1, '0 0']], C)
  const him = clawd({ liftL: -65, liftR: -65, eyesMove: eyesDown, moods: [['open', C * 0.18, 0], ['closed', C * 0.5, 0], ['happy', C * 0.32, 0]] })

  return about(12, 12, dip, him) + popping(20, 4.4, C, 0.72, 0.97, star(YELLOW, 0.9))
}

// "lol": shaking with laughter, clutching his middle, tears of joy flying and "HA"s popping round him.

const LAUGH_MS = 2400

/** "HA" in strokes, from (0, 0) to its baseline. */
const ha = (c = YELLOW) => `<path d="M0 0V1.7M0 0.85H0.95M0.95 0V1.7M1.6 1.7L2.1 0L2.6 1.7M1.78 1.1H2.42" fill="none" stroke="${c}" stroke-width="0.38" stroke-linecap="round" stroke-linejoin="round"/>`

/** A tear thrown out from his eye at (x, y) toward `dx`, every `dur` ms from `begin`. */
const tear = (x: number, y: number, dx: number, dur: number, begin: number) =>
  `<g transform="translate(${x} ${y})"><g opacity="0">` +
  `<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.15;1" dur="${dur}ms" begin="${begin}ms" repeatCount="indefinite"/>` +
  tf('translate', ['0 0', `${n(dx * 0.6)} -0.6`, `${n(dx)} 1.4`], dur, { begin, ease: '0.3 0 0.7 1' }) +
  drop(0.45) +
  '</g></g>'

function laughing(): string {
  const C = LAUGH_MS
  const bounce = tf('translate', ['0 0', '0 -0.4', '0 0'], 200)
  const rock = tf('rotate', ['-4 12 12', '4 12 12', '-4 12 12'], 800)
  const him = clawd({ eyes: 'happy', liftL: -40, liftR: -40, armL: swing('L', 14, 200), armR: swing('R', 14, 200, { begin: 100 }) })
  const tears = tear(8.6, 7.2, -2.2, 700, 0) + tear(15.4, 7.2, 2.2, 700, 350)
  const has = popping(19.6, 3, C, 0.08, 0.5, ha()) + popping(2.6, 3.6, C, 0.36, 0.78, ha(AMBER)) + popping(20.4, 5.4, C, 0.62, 0.98, ha())

  return moved(rock, moved(bounce, him + tears)) + has
}

// "High five": his claw winds down and snaps up to meet a hand coming in from the top right, a star bursting at the slap.

const FIVE_MS = 2600

/** The person's hand, its palm about (0, 0), fingers up, its forearm running off to the top right. */
const hand = () =>
  `<path d="M0.6 0.4L4.6 -3.6" stroke="${shade(SKIN, 0.08)}" stroke-width="1.5" stroke-linecap="round"/>` +
  pill(-1, -0.9, 2, 2, SKIN, 0.7) +
  [-0.95, -0.35, 0.25].map(x => pill(x, -2.2, 0.55, 1.7, SKIN, 0.27)).join('') +
  `<rect x="-1.2" y="-0.3" width="0.55" height="1.4" rx="0.27" fill="${SKIN}" transform="rotate(-35 -0.9 0.4)"/>`

function highFive(): string {
  const C = FIVE_MS
  const windup = tfk('rotate', [[0, R(35)], [0.22, R(35)], [0.36, R(-8)], [0.42, R(0)], [0.82, R(0)], [1, R(35)]], C)
  const hop = tfk('translate', [[0, '0 0'], [0.4, '0 0'], [0.48, '0 -1'], [0.58, '0 0'], [1, '0 0']], C)
  const him = clawd({ liftL: -20, liftR: 55, armR: windup, move: hop, moods: [['open', C * 0.4, 0.45], ['happy', C * 0.6, 0.3]] })
  const path: [number, string][] = [[0, '27 -1'], [0.2, '27 -1'], [0.38, '19.9 3.7'], [0.44, '20.6 3.1'], [0.56, '20.4 3.3'], [0.74, '27.5 -1.5'], [1, '27.5 -1.5']]
  const theirs = moved(tfk('translate', path, C, { ease: '0.3 0 0.5 1' }), `<g transform="rotate(25)">${hand()}</g>`)
  const burst =
    popping(18.9, 4.6, C, 0.38, 0.6, star(YELLOW, 1.3)) +
    during(`<path d="M17 2.6L16.4 1.9M19 2.2L19.1 1.3M21 3.4L21.7 2.9" stroke="${YELLOW}" stroke-width="0.32" stroke-linecap="round"/>`, 0.4, 0.56, C)

  return him + theirs + burst
}

// "Are you sure?" or "that's wrong": a sheepish head scratch, eyes cast down and away, sweat sliding down.

const SHEEPISH_MS = 3000

function sweatDrop(): string {
  const C = SHEEPISH_MS
  return `<g transform="translate(7.4 5)"><g opacity="0">${keyed('opacity', [[0, 0], [0.1, 0], [0.16, 1], [0.7, 1], [0.8, 0], [1, 0]], C)}${moved(tfk('translate', [[0, '0 0'], [0.16, '0 0'], [0.8, '-0.3 2'], [1, '-0.3 2']], C), drop(0.75))}</g></g>`
}

// "Dance": a side-to-side shuffle, arms pumping in turn, music notes floating up around him.

const DANCE_MS = 2400

function dancing(): string {
  const C = DANCE_MS
  const L = (d: number) => `${d} 7.3 7.5`
  const sway = tfk('translate', [[0, '0 0'], [0.25, '-1.3 0'], [0.5, '0 0'], [0.75, '1.3 0'], [1, '0 0']], C)
  const tilt = tfk('rotate', [[0, '0 12 12'], [0.25, '-7 12 12'], [0.5, '0 12 12'], [0.75, '7 12 12'], [1, '0 12 12']], C)
  const bounce = tf('translate', ['0 0', '0 -0.7', '0 0'], C / 4)
  const armL = tfk('rotate', [[0, L(20)], [0.25, L(80)], [0.5, L(20)], [0.75, L(-15)], [1, L(20)]], C)
  const armR = tfk('rotate', [[0, R(-20)], [0.25, R(15)], [0.5, R(-20)], [0.75, R(-80)], [1, R(-20)]], C)
  const him = clawd({ eyes: 'happy', armL, armR, walk: C / 2 })
  const notes = rising(3.6, 6.4, C, 0.05, 0.5, note(YELLOW), -0.6) + rising(20.6, 5.4, C, 0.3, 0.75, note(BLUE), 0.7) + rising(4.4, 5, C, 0.55, 0.98, note(BLUE), -0.5) + rising(21.4, 6.6, C, 0.78, 0.99, note(YELLOW), 0.4)

  return moved(sway, moved(tilt, moved(bounce, him))) + notes
}

// "*pats Clawd*": a hand comes down and pats his head three times; he squishes under each pat, then hearts.

const PAT_MS = 3200

/** The back of the person's hand seen from in front, fingers down, its forearm running off the top. */
const pattingHand = () =>
  `<path d="M0 -0.6V-6" stroke="${shade(SKIN, 0.08)}" stroke-width="1.6" stroke-linecap="round"/>` +
  pill(-1.8, -1, 3.6, 1.9, SKIN, 0.8) +
  [-1.6, -0.75, 0.1, 0.95].map(x => pill(x, 0.2, 0.7, 1.1, SKIN, 0.35)).join('')

function patting(): string {
  const C = PAT_MS
  const down = '12 3.7'
  const up = '12 3'
  const path: [number, string][] = [[0, '12 -2.5'], [0.12, down], [0.2, up], [0.28, down], [0.36, up], [0.44, down], [0.58, '12 -2.5'], [1, '12 -2.5']]
  const squash: [number, string][] = [[0, '1 1'], [0.11, '1 1'], [0.14, '1.05 0.92'], [0.2, '1 1'], [0.27, '1 1'], [0.3, '1.05 0.92'], [0.36, '1 1'], [0.43, '1 1'], [0.46, '1.05 0.92'], [0.52, '1 1'], [1, '1 1']]
  const him = clawd({ liftL: -10, liftR: -10, moods: [['open', C * 0.12, 0], ['happy', C * 0.88, 0]] })
  const theirs = moved(tfk('translate', path, C), pattingHand())
  const hearts = rising(18.4, 5.2, C, 0.56, 0.92, heart(), 0.8, 0.7) + rising(5.6, 5.4, C, 0.66, 0.99, heart(), -0.6, 0.55)

  return about(12, 12, tfk('scale', squash, C), him) + theirs + hearts
}

// Told to rest: at the turn's end he settles into a hammock strung between two posts, swinging gently, asleep.

const SWING_MS = 3600
const SWING = () => tf('rotate', ['-2.5 12 2', '2.5 12 2', '-2.5 12 2'], SWING_MS)

/** The posts, and the hammock's front swinging with him; drawn over him, so he sits in it. */
function hammock(): string {
  const posts = pill(2.2, 3.6, 0.8, 8.6, WOOD, 0.3) + pill(21, 3.6, 0.8, 8.6, WOOD, 0.3)
  const ropes = `<path d="M3 4.1L3.8 5.4M21 4.1L20.2 5.4" stroke="${shade(WOOD, 0.2)}" stroke-width="0.3" stroke-linecap="round"/>`
  const cloth =
    `<path d="M3.8 5.4Q12 15.4 20.2 5.4Q12 12.2 3.8 5.4z" fill="${CANVAS}"/>` +
    `<path d="M4.6 6.2Q12 13.6 19.4 6.2" fill="none" stroke="${PAGE}" stroke-opacity="0.55" stroke-width="0.3"/>`

  return posts + moved(SWING(), ropes + cloth) + zzz(17.6, 5.6)
}

export const REACTIONS: Pose[] = [
  { id: 'blush', alt: 'Clawd blushing', rest: { liftL: -50, liftR: -50 }, scene: blushing, cycle: BLUSH_MS },
  { id: 'mad', alt: 'Clawd getting mad', rest: { color: FLUSHED, eyes: 'angry', liftL: 35, liftR: 35 }, scene: mad, cycle: MAD_MS },
  { id: 'callMe', alt: 'Clawd saying call me', rest: { liftL: -30, liftR: 30 }, scene: callMe, cycle: CALL_MS },
  { id: 'roll', alt: 'Clawd doing a barrel roll', rest: {}, scene: rolling, cycle: ROLL_MS },
  { id: 'bow', alt: 'Clawd taking a bow', rest: { liftL: -65, liftR: -65 }, scene: bowing, cycle: BOW_MS },
  { id: 'laugh', alt: 'Clawd laughing', rest: { eyes: 'happy', liftL: -40, liftR: -40 }, scene: laughing, cycle: LAUGH_MS },
  { id: 'highFive', alt: 'Clawd giving a high five', rest: { liftL: -20, liftR: 20 }, scene: highFive, cycle: FIVE_MS },
  {
    id: 'sheepish',
    alt: 'Clawd looking sheepish',
    rest: { eyes: 'half', liftR: 115, armFront: true },
    loop: { armR: swing('R', 14, 380), tap: 750, moods: [['half', SHEEPISH_MS * 0.4, -0.35], ['closed', SHEEPISH_MS * 0.2, 0], ['half', SHEEPISH_MS * 0.4, -0.35]], breathe: [0.95, 1500] },
    props: sweatDrop,
    propsFront: true,
    propMove: 'fade',
    cycle: SHEEPISH_MS,
  },
  { id: 'dance', alt: 'Clawd dancing', rest: { eyes: 'happy' }, scene: dancing, cycle: DANCE_MS },
  { id: 'pat', alt: 'Clawd getting a head pat', rest: { liftL: -10, liftR: -10 }, scene: patting, cycle: PAT_MS },
  {
    id: 'hammock',
    alt: 'Clawd napping in a hammock',
    rest: { sit: true, eyes: 'closed', liftL: -60, liftR: -80 },
    loop: { breathe: [0.92, 4200], move: SWING() },
    props: hammock,
    propsFront: true,
    propMove: 'fade',
  },
]
