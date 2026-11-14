/**
 * Search synonyms for the stock-image strip.
 *
 * The thumbnail glob stays the only registration of an image (see the comment
 * in StartScreen.tsx); this is NOT a manifest. Nothing here lists what exists.
 * It only teaches the search box words a filename does not contain: typing
 * "shakespeare" should find hamlet_yorick_graveyard.
 *
 * A category matches an image when any of:
 *   - words: a whole word or phrase of the image's label ("hamlet",
 *     "romeo juliet"). New images whose names use these words are covered with
 *     no edit here -- prefer adding a word over adding a file.
 *   - years: a year token in the name ("1840s", "1776", "49bc") falls in range.
 *   - files: exact stock ids, for knowledge the name cannot carry (the style
 *     of an image whose name lacks a style suffix, the era of
 *     marie_antoinette_petit_trianon). searchSynonyms.test.ts fails on any id
 *     that no longer has a thumbnail, so these cannot rot silently.
 *   - include: another category matches.
 * `requires` narrows: every listed category must match as well.
 *
 * The query selects a category when it is a prefix (3+ letters) of one of the
 * category's names, whole or term by term. Otherwise multi-word queries AND
 * their terms: "victorian dress".
 */

export interface SearchCategory {
  /** Shown on the autocomplete pill; defaults to the first name, capitalized. */
  label?: string
  names: string[]
  words?: string[]
  years?: [number, number]
  files?: string[]
  include?: string[]
  /** Every one of these categories must also match (an intersection). */
  requires?: string[]
}

export const SEARCH_CATEGORIES: Record<string, SearchCategory> = {
  // ---- literature -------------------------------------------------------
  shakespeare: {
    label: 'Shakespeare',
    names: ['shakespeare', 'bard'],
    words: ['queen mab', 'shakespeare', 'hamlet', 'yorick', 'ophelia', 'macbeth', 'birnam', 'romeo', 'juliet', 'capulet',
      'titania', 'oberon', 'puck', 'tempest', 'prospero', 'viola illyria', 'malvolio', 'lear', 'falstaff',
      'rosalind', 'beatrice arbor', 'agincourt', 'winters tale', 'othello', 'bosworth', 'merchant venice',
      'julius caesar'],
    files: ['cleopatra_barge'],
  },
  novels: {
    label: 'Classic novels',
    names: ['novel', 'literature', 'book', 'books', 'classic', 'story', 'stories'],
    words: ['cheshire', 'white rabbit', 'oz', 'dorothy', 'treasure island', 'benbow', 'moby dick', 'ahab',
      'nautilus giant', 'nautilus undersea', 'fogg', 'baker street', 'sherlock', 'baskerville', 'reichenbach',
      'secret garden', 'willows', 'toad motor', 'mowgli', 'rikki', 'gulliver', 'laputa', 'robinson crusoe',
      'little women', 'jo march', 'pride prejudice', 'pemberley', 'darcy', 'bennet', 'anne', 'christmas carol',
      'fezziwig', 'marleys', 'journey center', 'frankenstein', 'dracula', 'whitby', 'quasimodo', 'esmeralda',
      'phantom', 'peter pan', 'war of the worlds', 'war of worlds', 'don quixote', 'odysseus', 'jabberwocky',
      'walrus and carpenter', 'owl and pussycat'],
    include: ['shakespeare', 'poems'],
  },
  poems: {
    label: 'Poems',
    names: ['poem', 'poems', 'poetry', 'poet'],
    words: ['ancient mariner', 'highwayman', 'kubla', 'hiawatha', 'paul revere', 'casey', 'goblin market',
      'night before christmas', 'raven bust', 'lady of shalott', 'jabberwocky', 'owl and pussycat', 'walrus and carpenter'],
  },
  fairytales: {
    label: 'Fairy tales',
    names: ['fairy tale', 'fairytale', 'fairy tales', 'folk tale', 'folktale', 'tale', 'tales', 'tall tale', 'legend', 'story'],
    words: ['cinderella', 'red riding hood', 'rapunzel', 'beanstalk', 'sleeping beauty', 'goldilocks', 'puss in boots',
      'rumpelstiltskin', 'princess and the pea', 'snow queen', 'beauty and the beast', 'pied piper', 'bremen',
      'elves and shoemaker', 'little mermaid', 'six swans', 'twelve dancing', 'firebird', 'baba yaga', 'urashima',
      'three little pigs', 'east of the sun', 'steadfast tin soldier', 'emperors new clothes', 'gingerbread house',
      'frog crown', 'vasilisa', 'sadko', 'billy goats', 'kaguya', 'momotaro', 'crane wife', 'kitsune wedding',
      'stone soup', 'golem', 'children of lir', 'ali baba', 'white snake', 'paul bunyan', 'johnny appleseed',
      'john henry', 'pecos bill', 'rip van winkle', 'headless horseman', 'monkey and crocodile', 'tortoise sky feast',
      'popocatepetl', 'genie', 'djinn', 'marid', 'aladdins', 'sinbad', 'scheherazade', 'flying carpet', 'sorcerers apprentice',
      'william tell'],
    include: ['arthurian', 'aesop', 'nursery'],
  },
  arthurian: {
    label: 'Arthur & Robin Hood',
    names: ['arthur', 'arthurian', 'camelot', 'king arthur', 'robin hood', 'knights'],
    words: ['camelot', 'arthur', 'merlin', 'galahad', 'excalibur', 'lady of the lake', 'round table', 'green knight',
      'tristan', 'shalott', 'sword in the stone', 'robin little john', 'sherwood', 'nottingham', 'friar tuck'],
  },
  aesop: {
    label: "Aesop's fables",
    names: ['aesop', 'fable', 'fables'],
    words: ['tortoise and hare', 'fox and grapes', 'north wind', 'crow and pitcher', 'lion and mouse', 'fox and crow',
      'town mouse', 'boy who cried wolf', 'goose golden eggs', 'fox and stork', 'belling the cat', 'wolf in sheeps',
      'milkmaid and her pail'],
  },
  nursery: {
    label: 'Nursery rhymes',
    names: ['nursery', 'rhyme', 'rhymes', 'mother goose'],
    words: ['hey diddle', 'old woman in a shoe', 'humpty', 'bo peep', 'mary mary', 'jack and jill', 'hickory',
      'owl and pussycat', 'jabberwocky', 'sixpence', 'old king cole', 'rub a dub', 'banbury', 'wee willie',
      'boy blue', 'walrus and carpenter', 'queen of hearts'],
  },
  music: {
    label: 'Music & ballet',
    names: ['music', 'musical', 'ballet', 'opera', 'symphony', 'orchestra', 'instrument', 'instruments', 'composer'],
    words: ['nutcracker', 'peter and the wolf', 'swan lake', 'papageno', 'queen of the night', 'queen of night',
      'mountain king', 'danse macabre', 'carnival of the animals', 'sorcerers apprentice', 'great gate', 'unhatched chicks',
      'aida', 'coppelia', 'giselle', 'william tell', 'carmen', 'moldau', 'phantom', 'mozart', 'accordion', 'guitar', 'cello',
      'harp', 'violin', 'sitar', 'marimba', 'drums', 'saxophone', 'piano', 'pipe organ', 'brass section', 'synth',
      'flute', 'luthier', 'turntable', 'music box', 'jazz club', 'opera house', 'valkyries'],
  },

  // ---- myth -------------------------------------------------------------
  greek: {
    label: 'Greek myths',
    names: ['greek', 'greece', 'olympian'],
    words: ['zeus', 'hera', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hermes', 'hades', 'poseidon', 'dionysus',
      'hephaestus', 'helios', 'kronos', 'atlas', 'hercules', 'perseus', 'theseus', 'achilles', 'jason', 'orpheus',
      'prometheus', 'pandora', 'icarus', 'medusa', 'minotaur', 'hydra', 'cerberus', 'pegasus', 'chimera', 'narcissus',
      'odysseus', 'three fates', 'parthenon', 'socrates', 'plato', 'aristotle', 'archimedes', 'euclid', 'pythagoras',
      'diogenes', 'olympia', 'alexander'],
  },
  norse: {
    label: 'Norse',
    names: ['norse', 'viking', 'vikings', 'scandinavian'],
    words: ['huldra', 'nisse', 'odin', 'thor', 'loki', 'freya', 'heimdall', 'valkyrie', 'valkyries', 'fenrir', 'jormungandr', 'sleipnir',
      'yggdrasil', 'ragnarok', 'norns', 'viking', 'vikings', 'up helly aa'],
  },
  celtic: {
    label: 'Celtic',
    names: ['celtic', 'irish', 'ireland', 'scottish', 'scotland'],
    words: ['tam lin', 'rhymer', 'oisin', 'tir na nog', 'kelpie', 'leprechaun', 'brownie', 'changeling', 'brigid', 'cernunnos', 'dagda', 'lugh', 'manannan', 'morrigan', 'banshee', 'dullahan', 'puca', 'fomorian',
      'tuatha', 'green man', 'salmon of knowledge', 'selkie', 'children of lir', 'shamrock', 'celtic', 'st patricks',
      'scottish', 'highland'],
    files: ['up_helly_aa_shetland', 'trinity_college_long_room', 'flying_scotsman_1930s'],
  },
  myths: {
    label: 'Myths & legends',
    names: ['myth', 'myths', 'mythology', 'mythical', 'gods', 'goddess', 'legend'],
    words: ['ra sun', 'anubis', 'isis', 'sphinx', 'nuwa', 'change moon', 'magpie bridge', 'monkey king', 'krishna',
      'ganesh', 'churning', 'hero twins', 'amaterasu', 'sedna', 'pele', 'quetzalcoatl', 'gilgamesh', 'thunderbird',
      'kitsune', 'kappa', 'tengu', 'oni', 'simurgh', 'roc', 'ghul', 'ifrit', 'djinn', 'griffin', 'phoenix', 'unicorn',
      'pegasus', 'kraken', 'leviathan', 'sea serpent', 'basilisk', 'balrog', 'popocatepetl'],
    include: ['greek', 'norse', 'celtic', 'fae'],
  },
  fae: {
    label: 'Fae & fairies',
    names: ['fae', 'faerie', 'faeries', 'fairy', 'fairies', 'elf', 'elves', 'elfland', 'wee folk', 'fair folk'],
    words: ['fairy', 'fae', 'tam lin', 'rhymer', 'elfland', 'oisin', 'tir na nog', 'fairy rade', 'changeling', 'kelpie',
      'leprechaun', 'brownie', 'queen mab', 'erlking', 'huldra', 'nisse', 'banshee', 'dullahan', 'puca', 'selkie',
      'will o wisp', 'tuatha', 'titania', 'oberon', 'puck', 'elves', 'gnome', 'mushroom houses', 'mushroom village',
      'mushroom hut'],
  },
  fantasy: {
    label: 'Fantasy',
    names: ['fantasy', 'magic', 'magical', 'creature', 'creatures', 'monster', 'monsters'],
    words: ['kelpie', 'erlking', 'changeling', 'dragon', 'fairy', 'wizard', 'witch', 'mermaid', 'merman', 'unicorn', 'griffin', 'phoenix', 'pegasus',
      'hippogriff', 'kraken', 'gnome', 'mushroom houses', 'mushroom village', 'mushroom hut', 'will o wisp', 'genie',
      'djinn', 'marid', 'golem', 'sentient tree', 'baby dragon', 'alebrije', 'steampunk'],
  },

  // ---- history and eras ---------------------------------------------------
  ancient: {
    label: 'Ancient world',
    names: ['ancient', 'antiquity', 'classical', 'roman', 'rome', 'egypt', 'egyptian'],
    years: [-5000, 499],
    words: ['pyramid', 'pyramids', 'colosseum', 'parthenon', 'pompeii', 'vesuvius', 'socrates', 'plato', 'aristotle',
      'archimedes', 'euclid', 'pythagoras', 'diogenes', 'alexander', 'caesar', 'cleopatra', 'hannibal', 'olympia',
      'stonehenge', 'babylon', 'persepolis', 'terracotta', 'great wall', 'nefertiti', 'tutankhamun', 'hypatia',
      'gilgamesh', 'marcus aurelius', 'aeolipile', 'roman', 'sphinx', 'anubis', 'isis', 'ra sun', 'confucius', 'laozi',
      'cai lun', 'zhang heng', 'petra', 'boudica', 'library of alexandria', 'mammoths cave'],
    files: ['vesuvius_79_misenum'],
  },
  medieval: {
    label: 'Medieval',
    names: ['medieval', 'middle ages', 'knight', 'knights', 'castle'],
    years: [500, 1449],
    words: ['medieval', 'camelot', 'arthur', 'merlin', 'galahad', 'excalibur', 'round table', 'green knight', 'tristan',
      'shalott', 'sword in the stone', 'robin little john', 'sherwood', 'nottingham', 'friar tuck', 'joan of arc',
      'magna carta', 'charlemagne', 'hildegard', 'illuminator', 'houppelande', 'viking', 'vikings', 'quasimodo',
      'esmeralda', 'chainmail', 'minstrel', 'byzantine', 'genghis', 'marco polo', 'mansa musa', 'ibn sina',
      'al khwarizmi', 'ibn al haytham', 'omar khayyam', 'averroes', 'maimonides', 'al jazari', 'su song', 'song dynasty'],
  },
  renaissance: {
    label: 'Renaissance',
    names: ['renaissance', 'tudor', 'tudors', 'elizabethan', '16th century', '17th century', 'baroque'],
    years: [1450, 1699],
    words: ['tudor', 'elizabethan', 'florentine', 'leonardo', 'michelangelo', 'galileo', 'copernicus', 'tycho',
      'shakespeare globe', 'gutenberg', 'henry viii', 'elizabeth i', 'dutch golden age', 'huygens', 'descartes',
      'spinoza', 'east indiaman', 'galleon'],
  },
  georgian: {
    label: 'Georgian',
    names: ['georgian', '18th century', 'rococo', 'colonial', 'revolutionary', 'enlightenment'],
    years: [1700, 1799],
    words: ['georgian', 'rococo', 'colonial', 'macaroni', 'versailles', 'marie antoinette', 'montgolfier', 'mozart',
      'salon', 'emilie du chatelet', 'kant', 'wollstonecraft', 'lavoisier', 'caroline herschel', 'harrison', 'jenner',
      'linnaeus', 'franklin', 'declaration', 'washington crossing', 'boston tea party', 'gulliver', 'laputa',
      'venice carnival', 'amber room', 'winter palace', 'admont'],
    files: ['schonbrunn_great_gallery'],
  },
  regency: {
    label: 'Regency',
    names: ['regency', 'jane austen', 'austen', 'empire waist'],
    years: [1800, 1836],
    words: ['regency', 'pride prejudice', 'pemberley', 'darcy', 'bennet', 'mary anning', 'humboldt', 'daguerre',
      'brighton pavilion', 'stephenson', 'harvest home', 'fezziwig'],
  },
  victorian: {
    label: 'Victorian',
    names: ['victorian', '19th century'],
    years: [1837, 1900],
    words: ['victorian', 'crinoline', 'bustle', 'ada lovelace', 'faraday', 'darwin', 'mendel', 'pasteur', 'edison',
      'tesla', 'florence nightingale', 'lincoln', 'harriet tubman', 'little women', 'jo march', 'sherlock',
      'baker street', 'baskerville', 'reichenbach', 'christmas carol', 'marleys', 'dracula', 'whitby', 'phantom',
      'war of the worlds', 'war of worlds', 'anne', 'casey', 'goblin market', 'magic lantern', 'parlor games',
      'gentleman tophat', 'steampunk', 'gold rush', 'klondike', 'homestead', 'homesteader', 'oregon trail',
      'cheshire', 'white rabbit', 'jabberwocky', 'walrus and carpenter', 'owl and pussycat', 'treasure island', 'benbow',
      'moby dick', 'ahab', 'fogg', 'nautilus giant', 'nautilus undersea', 'journey center', 'mowgli', 'rikki'],
  },
  edwardian: {
    label: 'Edwardian',
    names: ['edwardian', 'belle epoque', 'gilded age', 'titanic'],
    years: [1901, 1914],
    words: ['edwardian', 'titanic', 'secret garden', 'peter pan', 'willows', 'toad motor', 'suffrage', 'poiret',
      'cable car', 'ice cream parlor', 'paddle steamer', 'newport', 'marconi', 'wright brothers', 'easter parade'],
    files: ['eiffel_tower_construction_1888', 'milliners_shop_1890s', 'marie_curie_laboratory', 'kite_flying_1900s',
      'carousel_fair_1900s', 'punting_cherwell_1900s'],
  },
  twenties: {
    label: '1920s & 30s',
    names: ['1920s', 'twenties', 'roaring twenties', 'jazz age', 'flapper', 'art deco era'],
    years: [1920, 1939],
    words: ['flapper', 'jazz age', 'gatsby', 'orient express', 'graf zeppelin', 'lindbergh', 'tutankhamun', 'qipao',
      'bias cut', 'department store', 'flying scotsman'],
  },
  modern: {
    label: 'Mid-century',
    names: ['20th century', '1940s', '1950s', 'midcentury', 'retro', 'vintage'],
    years: [1940, 1999],
    words: ['diner', 'swing dress', 'new look', 'wartime', 'hot rod', 'vw van', 'rotary phone', 'vinyl turntable',
      'jukebox', 'apollo 11', 'berlin wall', 'everest'],
  },
  history: {
    label: 'History',
    names: ['history', 'historical', 'historic', 'famous people', 'event', 'events'],
    words: ['declaration', 'washington crossing', 'boston tea party', 'magna carta', 'wright brothers', 'gutenberg',
      'golden spike', 'statue of liberty workshop', 'eiffel tower construction', 'lindbergh', 'apollo 11', 'ellis island',
      'suffrage', 'crystal palace', 'berlin wall', 'vikings vinland', 'galileo', 'olympics', 'everest', 'titanic',
      'charlemagne', 'montgolfier', 'tutankhamun', 'marco polo', 'joan of arc', 'elizabeth i', 'marie antoinette',
      'lincoln', 'harriet tubman', 'florence nightingale', 'franklin', 'shakespeare globe', 'mozart', 'marie curie',
      'mansa musa', 'genghis', 'boudica', 'leonardo', 'napoleon', 'henry viii', 'buffalo soldier', 'paleontologists',
      'paul revere'],
    include: ['ancient', 'scholars'],
  },
  scholars: {
    label: 'Scholars & inventors',
    names: ['science', 'scientist', 'scientists', 'inventor', 'inventors', 'invention', 'scholar', 'scholars',
      'philosopher', 'philosophers', 'philosophy', 'astronomer', 'mathematician'],
    words: ['archimedes', 'euclid', 'aristotle', 'zhang heng', 'cai lun', 'al khwarizmi', 'ibn al haytham', 'ibn sina',
      'omar khayyam', 'hildegard', 'copernicus', 'tycho', 'newton', 'james watt', 'ada lovelace', 'faraday', 'darwin',
      'mendel', 'mary anning', 'stephenson', 'pasteur', 'edison', 'tesla', 'bell telephone', 'marconi', 'confucius',
      'laozi', 'plato', 'diogenes', 'pythagoras', 'marcus aurelius', 'averroes', 'maimonides', 'descartes', 'spinoza',
      'salon madame', 'emilie du chatelet', 'kant', 'wollstonecraft', 'thoreau', 'hero aeolipile', 'al jazari', 'su song',
      'huygens', 'harrison', 'jenner', 'caroline herschel', 'linnaeus', 'humboldt', 'lavoisier', 'daguerre', 'morse',
      'bertha benz', 'socrates', 'hypatia', 'galileo', 'gutenberg', 'leonardo', 'franklin', 'marie curie', 'wright brothers'],
  },

  // ---- clothes ----------------------------------------------------------
  fashion: {
    label: 'Fashion',
    names: ['fashion', 'clothes', 'clothing', 'costume', 'costumes', 'outfit', 'style'],
    words: ['dress', 'gown', 'bonnet', 'bonnets', 'dandy', 'lady', 'gentleman', 'kimono', 'furisode', 'junihitoe',
      'hanbok', 'sari', 'lehenga', 'dirndl', 'vyshyvanka', 'hmong', 'huipil', 'gakti', 'aso oke', 'qipao', 'deel',
      'lowicz', 'china poblana', 'maasai', 'sarafan', 'kaftan', 'ao dai', 'pau rider', 'houppelande', 'gamurra',
      'french hood', 'dutch golden age', 'robe a la francaise', 'macaroni', 'spencer', 'gigot', 'flapper', 'jazz age',
      'bias cut', 'wartime utility', 'new look', 'swing dress', 'poiret', 'motoring', 'garden party', 'milliners',
      'dressmaker', 'hatter', 'tailor', 'geisha', 'mill girl', 'shaker sister', 'captains wife', 'skater', 'creole',
      'oregon trail', 'harvey girl', 'horsewoman', 'easter parade', 'feria', 'byzantine empress', 'puffed sleeves',
      'marie antoinette', 'elizabeth i', 'georgian tea', 'emilie du chatelet', 'ada lovelace', 'salon madame',
      'rotten row', 'lawn tennis', 'croquet', 'regency picnic', 'punting', 'tobogganing', 'roller rink', 'boating lake',
      'victorian lady', 'victorian gentleman', 'victorian dandy', 'victorian explorer', 'nicodemus', 'norwegian homesteader',
      'homestead woman', 'klondike woman', 'pie seller', 'whaling captain', 'riverboat gambler', 'californio',
      'buffalo soldier', 'boston rower', 'mozart child', 'darcy', 'pemberley', 'pride prejudice', 'suffrage',
      'mardi gras masquerade', 'venice carnival'],
    include: ['worlddress'],
  },
  // Typed into a search box, "dress" and "gown" mean the garment, so they
  // narrow to the women in fashion. "fashion" and "clothes" stay general.
  gowns: {
    label: 'Gowns',
    names: ['gown', 'gowns', 'dress', 'dresses'],
    include: ['fashion'],
    requires: ['women'],
  },
  worlddress: {
    label: 'Traditional dress',
    names: ['traditional', 'folk costume', 'folk dress', 'national dress', 'cultural', 'world'],
    words: ['kimono', 'furisode', 'junihitoe', 'hanbok', 'sari', 'lehenga', 'dirndl', 'vyshyvanka', 'hmong', 'huipil',
      'gakti', 'highland dress', 'aso oke', 'quechua', 'qipao', 'deel', 'lowicz', 'china poblana', 'maasai', 'sarafan',
      'kaftan', 'ao dai', 'pau rider', 'geisha', 'feria', 'norwegian homesteader', 'californio', 'new orleans creole'],
  },

  // ---- places -------------------------------------------------------------
  american: {
    label: 'America',
    names: ['america', 'american', 'usa', 'united states', 'americana'],
    words: ['fourth of july', 'thanksgiving', 'statue of liberty', 'golden gate', 'mount rushmore', 'declaration',
      'washington crossing', 'boston', 'lincoln', 'harriet tubman', 'franklin', 'paul revere', 'casey', 'ellis island',
      'suffrage', 'apollo 11', 'wright brothers', 'golden spike', 'edison', 'paul bunyan', 'johnny appleseed',
      'john henry', 'pecos bill', 'rip van winkle', 'headless horseman', 'little women', 'oz', 'diner', 'nantucket',
      'vermont', 'lowell', 'shaker', 'newport', 'new england', 'new orleans', 'savannah', 'texas', 'harvey girl',
      'riverboat', 'mississippi', 'californio', 'buffalo soldier', 'oregon trail', 'gold rush', 'homestead',
      'homesteader', 'nicodemus', 'norwegian homesteader', 'klondike', 'old cowboy', 'whaling', 'moby dick',
      'thoreau', 'cable car', 'general store', 'one room schoolhouse', 'quilting bee', 'colonial', 'mardi gras',
      'paleontologists', 'bison', 'bald eagle', 'saguaro', 'pueblo'],
  },
  newengland: {
    label: 'New England',
    names: ['new england', 'yankee', 'maine', 'massachusetts', 'vermont'],
    words: ['new england', 'nantucket', 'vermont', 'lowell', 'shaker', 'newport', 'boston', 'whaling', 'moby dick',
      'thoreau', 'little women', 'jo march', 'paul revere', 'maine coon'],
  },
  west: {
    label: 'Frontier & South',
    names: ['western', 'wild west', 'frontier', 'cowboy', 'cowboys', 'pioneer', 'pioneers', 'south', 'southern'],
    words: ['old cowboy', 'gold rush', 'klondike', 'homestead', 'homesteader', 'oregon trail', 'texas', 'harvey girl',
      'buffalo soldier', 'californio', 'pecos bill', 'paul bunyan', 'john henry', 'general store', 'one room schoolhouse',
      'golden spike', 'paleontologists', 'nicodemus', 'new orleans', 'savannah', 'riverboat', 'mississippi', 'mardi gras',
      'bison', 'saguaro'],
  },
  japan: {
    label: 'Japan',
    names: ['japan', 'japanese'],
    words: ['ukiyo', 'kimono', 'furisode', 'junihitoe', 'geisha', 'samurai', 'himeji', 'tokyo', 'fuji', 'kitsune', 'kappa',
      'tengu', 'oni', 'hanami', 'kenrokuen', 'edo', 'momotaro', 'kaguya', 'crane wife', 'urashima', 'amaterasu',
      'japanese', 'koi', 'capybara hot spring'],
  },
  china: {
    label: 'China',
    names: ['china', 'chinese'],
    words: ['chinese', 'great wall', 'terracotta', 'forbidden city', 'confucius', 'laozi', 'cai lun', 'zhang heng',
      'su song', 'song dynasty', 'suzhou', 'monkey king', 'change moon', 'nuwa', 'magpie bridge', 'white snake',
      'lunar new year', 'dragon boat', 'qipao', 'kubla', 'genghis', 'marco polo', 'panda', 'red panda'],
  },
  india: {
    label: 'India',
    names: ['india', 'indian', 'hindu'],
    words: ['madhubani', 'taj mahal', 'diwali', 'holi', 'sari', 'lehenga', 'krishna', 'ganesh', 'churning', 'rikki',
      'mowgli', 'mysore', 'darjeeling', 'shalimar', 'monkey and crocodile', 'sitar', 'fogg'],
  },
  africa: {
    label: 'Africa',
    names: ['africa', 'african', 'safari', 'savanna'],
    words: ['african', 'tingatinga', 'savanna', 'lion', 'giraffe', 'zebra', 'elephant', 'rhino', 'hippos', 'cheetah',
      'leopard', 'gorilla', 'chimpanzee', 'meerkat', 'wildebeest', 'okapi', 'lemurs', 'nile crocodile', 'ostrich',
      'mandrill', 'warthog', 'cape buffalo', 'wild dogs', 'crowned crane', 'shoebill', 'breasted roller', 'secretary bird',
      'pangolin', 'aardvark', 'fennec', 'bongo', 'bush baby', 'sable', 'maasai', 'yoruba', 'mansa musa', 'tortoise sky feast',
      'great pyramids', 'great pyramid', 'sphinx', 'tutankhamun', 'nefertiti'],
  },
  middleeast: {
    label: 'Arabian Nights',
    names: ['arabian', 'arabian nights', 'persian', 'middle east', 'islamic', 'ottoman'],
    words: ['persian', 'islamic', 'ottoman', 'topkapi', 'scheherazade', 'sinbad', 'aladdins', 'ali baba', 'djinn', 'genie',
      'marid', 'ifrit', 'ghul', 'roc', 'simurgh', 'flying carpet', 'bazaar', 'oasis', 'silk road', 'al khwarizmi',
      'ibn al haytham', 'ibn sina', 'omar khayyam', 'averroes', 'al jazari', 'maimonides', 'persepolis', 'petra',
      'hagia sophia', 'alhambra', 'alcazar', 'kubla', 'spice market'],
  },
  landmarks: {
    label: 'Landmarks',
    names: ['landmark', 'landmarks', 'travel', 'architecture', 'building', 'buildings', 'world wonder', 'wonders'],
    words: ['alhambra', 'angkor', 'aztec ruins', 'chichen itza', 'colosseum', 'eiffel', 'golden gate', 'great pyramids',
      'great wall', 'hagia sophia', 'himeji', 'leaning tower', 'machu picchu', 'moai', 'mount rushmore', 'neuschwanstein',
      'opera house', 'parthenon', 'petra', 'potala', 'sagrada', 'saint basils', 'santorini', 'statue of liberty',
      'stonehenge', 'sydney opera', 'taj mahal', 'tokyo', 'venice', 'london bus', 'scottish castle', 'pueblo ruins',
      'architecture', 'cityscape', 'skyline'],
    include: ['palaces'],
  },
  palaces: {
    label: 'Palaces & castles',
    names: ['palace', 'palaces', 'castle', 'castles', 'interior', 'interiors', 'royal', 'grand'],
    words: ['palace', 'castle', 'hall of mirrors', 'topkapi', 'forbidden city', 'schonbrunn', 'amber room',
      'trinity college', 'neuschwanstein', 'mysore', 'brighton pavilion', 'admont', 'winter palace', 'doges palace',
      'versailles', 'grand hotel', 'ballroom', 'library', 'opera house', 'himeji', 'alhambra', 'camelot'],
  },
  gardens: {
    label: 'Gardens & flowers',
    names: ['garden', 'gardens', 'flower', 'flowers', 'floral', 'botanical', 'bloom', 'blossom', 'plants'],
    words: ['garden', 'gardens', 'flowers', 'flower', 'bouquet', 'rose', 'roses', 'tulip', 'tulips', 'tulip fields',
      'sunflower', 'sunflowers', 'poppy', 'peonies', 'lilac', 'lily', 'lilies', 'orchids', 'magnolia', 'magnolias',
      'wisteria', 'hydrangea', 'dahlia', 'daisy', 'zinnia', 'ranunculus', 'anemone', 'protea', 'camellia',
      'chrysanthemum', 'cosmos', 'pansy', 'morning glory', 'foxglove', 'hibiscus', 'marigold', 'cherry blossoms',
      'wildflower', 'wildflowers', 'lotus', 'irises', 'succulent', 'succulents', 'greenhouse', 'conservatory',
      'keukenhof', 'giverny', 'versailles parterres', 'butchart', 'kew', 'villa d este', 'sissinghurst', 'kenrokuen',
      'shalimar', 'bagatelle', 'alcazar', 'suzhou', 'botanical', 'water lilies', 'hanami', 'secret garden'],
  },

  // ---- nature -------------------------------------------------------------
  dinosaurs: {
    label: 'Dinosaurs',
    names: ['dinosaur', 'dinosaurs', 'dino', 'dinos', 'prehistoric', 'jurassic', 'cretaceous', 'fossil', 'fossils', 'ice age'],
    words: ['trex', 'triceratops', 'argentinosaurus', 'stegosaurus', 'parasaurolophus', 'ankylosaurus', 'velociraptor',
      'pteranodon', 'pterodactyl', 'mosasaur', 'plesiosaur', 'mammoths', 'sabertooth', 'spinosaurus', 'archaeopteryx',
      'dimetrodon', 'maiasaura', 'paleontologists', 'diplodocus', 'brachiosaurus', 'ammonite', 'mary anning',
      'cave painting'],
  },
  dogs: {
    label: 'Dogs',
    names: ['dog', 'dogs', 'puppy', 'puppies'],
    words: ['dog', 'dogs', 'corgi', 'dachshund', 'husky', 'collie', 'retriever', 'puppies', 'hound', 'wild dogs', 'wolf',
      'wolves'],
  },
  cats: {
    label: 'Cats',
    names: ['cat', 'cats', 'kitten', 'kittens', 'kitty'],
    words: ['cat', 'cats', 'kittens', 'maine coon', 'calico', 'cheshire', 'puss', 'pussycat', 'belling the cat', 'tiger',
      'lion', 'leopard', 'cheetah', 'snow leopard', 'sabertooth'],
  },
  birds: {
    label: 'Birds',
    names: ['bird', 'birds'],
    words: ['bird', 'birds', 'eagle', 'bluebird', 'bluejay', 'cardinal', 'crane', 'crow', 'dove', 'ducklings', 'finches',
      'flamingo', 'goose', 'hawk', 'hen', 'chicks', 'heron', 'hummingbird', 'kingfisher', 'macaws', 'oriole', 'ostrich',
      'owl', 'parrot', 'parrots', 'peacock', 'pelican', 'penguins', 'falcon', 'puffin', 'raven', 'robin', 'rooster',
      'breasted roller', 'secretary bird', 'shoebill', 'snowy owl', 'swan', 'swans', 'toucan', 'woodpecker', 'albatross',
      'archaeopteryx', 'magpie', 'phoenix', 'roc', 'simurgh', 'thunderbird'],
  },
  sea: {
    label: 'Ocean',
    names: ['ocean', 'oceans', 'sea', 'underwater', 'marine', 'beach', 'aquarium', 'nautical'],
    words: ['mermaid', 'merman', 'coral reef', 'jellyfish', 'kelp', 'octopus', 'whale', 'dolphins', 'orca', 'manta',
      'seahorses', 'seal', 'sea otter', 'sea turtle', 'shipwreck', 'kraken', 'leviathan', 'sea serpent', 'tide pool',
      'tide pools', 'seashells', 'flounder', 'crab', 'nautilus', 'mosasaur', 'sedna', 'sadko', 'selkie', 'lighthouse',
      'pier', 'seaside', 'beach', 'aquarium', 'fish tank', 'bioluminescent', 'narwhal', 'urashima', 'little mermaid'],
  },
  animals: {
    label: 'Animals',
    names: ['animal', 'animals', 'wildlife', 'zoo', 'pets', 'pet', 'farm'],
    words: ['aardvark', 'alpacas', 'arctic fox', 'arctic hare', 'axolotl', 'goats', 'badger', 'bat', 'bats', 'bear',
      'bears', 'beaver', 'bison', 'rhino', 'bongo', 'buffalo', 'bush baby', 'capybara', 'chameleon', 'cheetah',
      'chimpanzee', 'chipmunk', 'cow', 'deer', 'elephant', 'elk', 'fawn', 'fennec', 'fox', 'frog', 'frogs', 'gecko',
      'giraffe', 'gorilla', 'grizzly', 'guinea pigs', 'hare', 'hedgehog', 'hippos', 'horse', 'horses', 'kangaroo', 'koala',
      'lemurs', 'leopard', 'lion', 'mandrill', 'meerkat', 'monkey', 'moose', 'mouse', 'okapi', 'opossum', 'otter',
      'panda', 'pangolin', 'piglets', 'platypus', 'polar bears', 'quokka', 'rabbit', 'raccoon', 'red panda', 'reindeer',
      'sabertooth', 'sheep', 'skunk', 'sloth', 'snails', 'snow leopard', 'squirrel', 'tiger', 'tortoise', 'turtle',
      'walrus', 'warthog', 'wildebeest', 'wolf', 'wolves', 'zebra', 'mammoths', 'kittens', 'barn'],
    include: ['dogs', 'cats', 'birds', 'sea', 'dinosaurs'],
  },

  // ---- occasions ------------------------------------------------------------
  christmas: {
    label: 'Christmas',
    names: ['christmas', 'xmas', 'yule', 'santa'],
    words: ['nisse', 'christmas', 'santas', 'nutcracker', 'night before christmas', 'gingerbread', 'snow globe', 'fezziwig',
      'marleys', 'green knight yule'],
  },
  halloween: {
    label: 'Halloween',
    names: ['halloween', 'spooky', 'scary', 'creepy', 'gothic', 'horror'],
    words: ['jack o lanterns', 'haunted', 'spooky', 'pumpkin patch', 'witch', 'witchs', 'bats', 'vampire', 'vampiress',
      'headless horseman', 'danse macabre', 'dracula', 'frankenstein', 'calavera', 'catrina', 'ofrenda', 'ghost',
      'gargoyle', 'banshee', 'dullahan', 'marleys', 'baskerville', 'phantom', 'macbeth witches', 'raven', 'cerberus'],
  },
  holidays: {
    label: 'Holidays & festivals',
    names: ['holiday', 'holidays', 'festival', 'festivals', 'celebration', 'celebrations', 'party', 'carnival'],
    words: ['easter', 'valentines', 'st patricks', 'fourth of july', 'thanksgiving', 'new years', 'hanukkah',
      'lunar new year', 'diwali', 'mardi gras', 'holi', 'passover', 'eid', 'kwanzaa', 'carnival', 'oktoberfest',
      'midsummer', 'songkran', 'inti raymi', 'up helly aa', 'hanami', 'feria', 'notting hill', 'loy krathong',
      'tomatina', 'dragon boat', 'bonfire night', 'binche', 'naadam', 'hmong new year', 'venice carnival', 'wedding'],
    include: ['christmas', 'halloween'],
  },
  food: {
    label: 'Food',
    names: ['food', 'foods', 'dessert', 'desserts', 'sweets', 'treats', 'baking', 'cooking', 'kitchen', 'eat'],
    words: ['bagels', 'bakery', 'berries', 'breakfast', 'cake', 'cakes', 'candies', 'candy', 'charcuterie', 'cheese',
      'cherries', 'coffee', 'cupcakes', 'donuts', 'fruit', 'gingerbread', 'gummi', 'ice cream', 'jello', 'macarons',
      'pizza', 'potato', 'produce', 'ramen', 'stir fry', 'sushi', 'tomato soup', 'watermelon', 'tea set', 'tea party',
      'farmers market', 'spice market', 'cornucopia', 'feast', 'kitchen', 'diner', 'wine cellar', 'stone soup',
      'sixpence', 'queen of hearts', 'pie seller', 'kingdom of sweets', 'picnic', 'cafe', 'teahouse', 'bread'],
  },
  vehicles: {
    label: 'Trains, ships & planes',
    names: ['vehicle', 'vehicles', 'transport', 'transportation', 'train', 'trains', 'railway', 'railroad', 'plane', 'planes',
      'ship', 'ships', 'boat', 'boats', 'car', 'cars', 'aircraft', 'flight', 'travel'],
    words: ['train', 'railway', 'locomotive', 'orient express', 'flying scotsman', 'cable car', 'station', 'stephenson',
      'golden spike', 'ship', 'ships', 'boat', 'clipper', 'galleon', 'junk', 'east indiaman', 'narrowboat', 'steamboat',
      'paddle steamer', 'liner', 'sailboat', 'sailing', 'titanic', 'pequod', 'whaleboat', 'canoe', 'punting', 'barge',
      'tall ships', 'submarine', 'dragon boat', 'vikings vinland', 'biplane', 'balloon', 'balloons', 'zeppelin', 'rocket',
      'wright brothers', 'lindbergh', 'montgolfier', 'motorwagen', 'automobile', 'motoring', 'hot rod', 'vw van',
      'motorcycle', 'bicycle', 'london bus', 'fire engine', 'toad motor', 'carriage', 'coach', 'chariot'],
  },
  space: {
    label: 'Space',
    names: ['space', 'astronomy', 'stars', 'planet', 'planets', 'moon', 'cosmos', 'universe'],
    words: ['astronaut', 'rocket', 'space station', 'galaxy', 'nebula', 'saturn', 'starry sky', 'apollo 11', 'observatory',
      'telescope', 'copernicus', 'tycho', 'caroline herschel', 'galileo', 'omar khayyam', 'change moon', 'kaguya'],
  },
  winter: {
    label: 'Winter',
    names: ['winter', 'snow', 'snowy', 'cold', 'ice'],
    words: ['winter', 'snow', 'snowy', 'frozen', 'ice cave', 'polar bears', 'penguins', 'arctic', 'skater', 'tobogganing',
      'klondike', 'husky', 'snowy owl', 'snow leopard', 'snow globe', 'kenrokuen', 'trans siberian', 'up helly aa',
      'nutcracker land of snow', 'mammoths', 'sami', 'maple', 'sugarhouse', 'everest', 'moose', 'sleigh'],
  },
  autumn: {
    label: 'Autumn',
    names: ['autumn', 'fall', 'harvest'],
    words: ['autumn', 'fall', 'harvest', 'pumpkin', 'thanksgiving', 'cornucopia', 'maple', 'dachshund autumn',
      'squirrel autumn', 'jack o lanterns', 'headless horseman', 'oktoberfest', 'bonfire night'],
  },
  // People, not events: history also holds Apollo 11 and the Berlin Wall.
  // Gendered words (woman, man, lady) are deliberately not names here --
  // they would pull in every figure of either sex; plain label matching
  // handles homestead_woman and old_woman_in_a_shoe.
  people: {
    label: 'People',
    names: ['people', 'person', 'portrait', 'figure', 'figures', 'famous'],
    words: ['joan of arc', 'elizabeth i', 'marie antoinette', 'lincoln', 'harriet tubman', 'florence nightingale',
      'mansa musa', 'genghis', 'boudica', 'napoleon', 'henry viii', 'cleopatra', 'caesar', 'alexander', 'hannibal',
      'charlemagne', 'marco polo', 'mozart', 'shakespeare globe', 'leonardo', 'michelangelo', 'nefertiti', 'franklin',
      'washington crossing', 'paul revere', 'wright brothers', 'lindbergh', 'marcus aurelius'],
    include: ['fashion', 'scholars'],
  },
  // Who is in the picture. Hand-built from knowledge of the library: most
  // figures are named for who they are (harriet_tubman, ophelia), not "woman".
  women: {
    label: 'Women',
    names: ['woman', 'women', 'lady', 'ladies', 'girl', 'girls', 'female', 'heroine', 'heroines'],
    words: ['tam lin', 'huldra', 'oisin niamh', 'rhymer elfland', 'woman', 'women', 'lady', 'ladies', 'girl', 'girls', 'queen', 'princess', 'princesses', 'empress', 'sultana',
      'mermaid', 'mermaids', 'witch', 'witchs', 'witches', 'sister', 'sisters', 'wife', 'wives', 'maid', 'milkmaid',
      'barmaid', 'goddess', 'bride', 'ballerina', 'sorceress', 'flapper', 'geisha', 'catrina', 'fairy',
      'harriet tubman', 'joan of arc', 'elizabeth i', 'marie antoinette', 'florence nightingale', 'marie curie',
      'boudica', 'nefertiti', 'cleopatra', 'hypatia', 'hildegard', 'ada lovelace', 'mary anning', 'wollstonecraft',
      'emilie du chatelet', 'caroline herschel', 'bertha benz', 'salon madame', 'lavoisier', 'suffrage',
      'mill girl', 'shaker sister', 'captains wife', 'skater', 'newport lady', 'creole lady', 'oregon trail', 'savannah lady',
      'harvey girl', 'horsewoman', 'pie seller', 'klondike woman', 'homestead woman', 'nicodemus', 'norwegian homesteader',
      'victorian lady', 'spencer bonnet', 'houppelande', 'gamurra', 'french hood', 'dutch golden age', 'robe a la francaise',
      'gigot', 'garden party', 'poiret', 'bias cut', 'wartime utility', 'new look', 'swing dress', 'byzantine empress',
      'kimono', 'furisode', 'junihitoe', 'hanbok', 'sari', 'lehenga', 'vyshyvanka', 'huipil', 'gakti', 'aso oke', 'quechua',
      'qipao', 'lowicz', 'china poblana', 'sarafan', 'kaftan', 'ao dai', 'pau rider', 'hmong',
      'cinderella', 'red riding hood', 'rapunzel', 'goldilocks', 'sleeping beauty', 'princess and the pea', 'snow queen',
      'beauty and the beast', 'little mermaid', 'six swans', 'twelve dancing', 'east of the sun', 'ophelia',
      'lady macbeth', 'juliet', 'titania', 'viola', 'rosalind', 'beatrice', 'othello', 'shalott', 'lady of the lake',
      'isolde', 'anne', 'jo march', 'little women', 'pride prejudice', 'pemberley', 'darcy elizabeth', 'mrs bennet',
      'secret garden', 'dorothy', 'esmeralda', 'phantom', 'highwayman', 'goblin market', 'kaguya', 'crane wife',
      'vasilisa', 'white snake', 'change moon', 'nuwa', 'isis', 'pele', 'sedna', 'medusa', 'freya', 'valkyrie',
      'valkyries', 'norns', 'three fates', 'brigid', 'morrigan', 'aphrodite', 'athena', 'artemis', 'zeus hera',
      'pandora', 'scheherazade', 'carmen', 'giselle', 'swan lake', 'queen of the night', 'queen of night', 'aida',
      'nutcracker', 'queen of hearts', 'mary mary', 'bo peep', 'jack and jill', 'old woman', 'banbury', 'hanami',
      'feria', 'easter parade', 'croquet', 'lawn tennis', 'punting', 'regency picnic', 'rotten row', 'boating lake',
      'roller rink', 'quilting bee', 'dressmaker', 'milliners', 'lacemaker', 'mardi gras masquerade', 'reading girl',
      'flower picker', 'autumn woman', 'woman irises', 'glamour', 'loki sif', 'henry viii six wives', 'dancing in rain',
      'popocatepetl', 'children of lir', 'tristan', 'titania bottom', 'georgian tea', 'one room schoolhouse',
      'beach day', 'department store', 'edwardian motoring', 'victorian seaside', 'notting hill', 'rio carnival',
      'swedish midsummer', 'diwali', 'holi', 'selkie'],
  },
  men: {
    label: 'Men',
    names: ['man', 'men', 'boy', 'boys', 'gentleman', 'gentlemen', 'male', 'hero', 'heroes'],
    words: ['tam lin', 'rhymer', 'oisin', 'erlking', 'leprechaun', 'brownie', 'nisse', 'changeling', 'man', 'men', 'boy', 'boys', 'king', 'prince', 'gentleman', 'dandy', 'knight', 'knights', 'wizard', 'merman',
      'cowboy', 'fisherman', 'captain', 'farmer', 'soldier', 'samurai', 'sultan', 'emperor', 'barkeep', 'blacksmith',
      'glassblower', 'luthier', 'matador', 'minstrel', 'flute player', 'cooper', 'wheelwright', 'clockmaker',
      'bookbinder', 'hatter', 'tailor', 'silversmith', 'illuminator', 'perfumer', 'basket weaver', 'jacquard weaver',
      'prospector', 'miner', 'stampeder', 'sodbuster', 'rower', 'gambler', 'ranchero', 'explorer', 'piper',
      'highland dress', 'macaroni', 'regency dandy', 'elizabethan gentleman', 'jazz age gentleman', 'victorian gentleman',
      'lincoln', 'washington crossing', 'franklin', 'paul revere', 'napoleon', 'henry viii', 'genghis', 'mansa musa',
      'charlemagne', 'caesar', 'alexander', 'hannibal', 'marco polo', 'kubla', 'leonardo', 'michelangelo', 'galileo',
      'mozart', 'shakespeare', 'archimedes', 'euclid', 'aristotle', 'socrates', 'plato', 'diogenes', 'pythagoras',
      'confucius', 'laozi', 'zhang heng', 'cai lun', 'al khwarizmi', 'ibn al haytham', 'ibn sina', 'omar khayyam',
      'averroes', 'maimonides', 'copernicus', 'tycho', 'newton', 'james watt', 'faraday', 'darwin', 'mendel',
      'stephenson', 'pasteur', 'edison', 'tesla', 'bell telephone', 'marconi', 'marcus aurelius', 'descartes', 'spinoza',
      'kant', 'thoreau', 'hero aeolipile', 'al jazari', 'su song', 'huygens', 'harrison', 'jenner', 'linnaeus',
      'humboldt', 'lavoisier', 'daguerre', 'morse', 'gutenberg', 'wright brothers', 'lindbergh', 'gentleman tophat',
      'hamlet', 'macbeth', 'lear', 'romeo', 'malvolio', 'falstaff', 'prospero', 'oberon', 'puck', 'bottom', 'othello',
      'merlin', 'arthur', 'galahad', 'green knight', 'robin little john', 'friar tuck', 'sherwood', 'nottingham',
      'tristan', 'sherlock', 'baker street', 'ahab', 'moby dick', 'dracula', 'frankenstein', 'quasimodo', 'fogg',
      'gulliver', 'robinson crusoe', 'mowgli', 'don quixote', 'odysseus', 'ancient mariner', 'paul bunyan',
      'john henry', 'pecos bill', 'johnny appleseed', 'rip van winkle', 'headless horseman', 'momotaro', 'urashima',
      'sadko', 'ali baba', 'sinbad', 'golem', 'william tell', 'papageno', 'pied piper', 'old king cole', 'boy blue',
      'wee willie', 'humpty', 'rumpelstiltskin', 'jack and the beanstalk', 'puss in boots', 'elves and shoemaker',
      'sorcerers apprentice', 'fezziwig', 'marleys', 'christmas carol', 'thor', 'odin', 'loki', 'heimdall', 'zeus',
      'hercules', 'icarus', 'perseus', 'theseus', 'achilles', 'jason', 'orpheus', 'prometheus', 'poseidon', 'hades',
      'apollo', 'ares', 'hermes', 'dionysus', 'hephaestus', 'helios', 'kronos', 'atlas', 'narcissus', 'dagda', 'lugh',
      'manannan', 'cernunnos', 'krishna', 'ganesh', 'ra sun', 'anubis', 'gilgamesh', 'monkey king', 'djinn', 'genie',
      'marid', 'ifrit', 'buffalo soldier', 'boston tea party', 'declaration', 'whaling captain', 'maple farmer',
      'sugarhouse', 'savile row', 'darcy', 'jabberwocky', 'paleontologists', 'casey', 'hiawatha', 'galahad'],
  },
  funny: {
    label: 'Funny & cute',
    names: ['funny', 'cute', 'humor', 'humour', 'comic', 'kawaii', 'silly'],
    words: ['chibi', 'raccoon tea party', 'octopus juggling', 'weird pizza', 'frog crown', 'fox reading', 'owl books',
      'hamlet vegetable', 'romeo juliet cats', 'genie wish', 'goats', 'piglets', 'hey diddle', 'humpty'],
  },

  // ---- art styles (for images whose names lack the style suffix) ------------
  stainedglass: {
    label: 'Stained glass',
    names: ['stained glass', 'glass', 'window'],
    words: ['stained glass'],
    files: ['macbeth_witches_cauldron', 'round_table_camelot', 'galahad_holy_grail', 'quasimodo_bell_tower',
      'esmeralda_dancing', 'joan_of_arc_orleans', 'alexander_gordian_knot', 'charlemagne_coronation_800',
      'magna_carta_runnymede_1215', 'hildegard_of_bingen', 'pythagoras_harmony', 'children_of_lir_swans',
      'byzantine_empress_court', 'queen_of_the_night', 'nutcracker_waltz_of_flowers'],
  },
  artdeco: {
    label: 'Art deco',
    names: ['art deco', 'deco'],
    words: ['art deco'],
    files: ['isis_winged_goddess', 'lindbergh_spirit_of_st_louis_1927', 'tutankhamun_tomb_1922', 'cleopatra_barge',
      'war_of_the_worlds_tripods', 'flapper_1925', 'bias_cut_gown_1934', 'qipao_shanghai_1930s', 'department_store_1920s',
      'orient_express_1930s', 'graf_zeppelin_1929', 'beach_day_1920s', 'persepolis_nowruz_procession',
      'tesla_coil_colorado', 'bertha_benz_motorwagen_1888', 'swan_lake_black_swan'],
  },
  artnouveau: {
    label: 'Art nouveau',
    names: ['art nouveau', 'nouveau', 'mucha'],
    words: ['art nouveau'],
    files: ['snow_queen_art_nouveau', 'phantom_of_the_opera_lake', 'phantom_masked_ball', 'titania_bottom_bower',
      'nutcracker_land_of_snow', 'mardi_gras_masquerade', 'eiffel_tower_construction_1888', 'marie_curie_laboratory',
      'caroline_herschel_comets', 'edwardian_garden_party_1905', 'milliners_shop_1890s', 'balloon_race_1906',
      'twelve_dancing_princesses_art_nouveau'],
  },
  cutpaper: {
    label: 'Cut paper',
    names: ['cut paper', 'paper', 'papercraft', 'papercut'],
    words: ['cut paper', 'papercut'],
    files: ['owl_and_pussycat', 'walrus_and_carpenter', 'rikki_tikki_tavi', 'don_quixote_windmills', 'peter_pan_neverland',
      'agincourt_longbows', 'peter_and_the_wolf_procession', 'coppelia_dollmakers_workshop', 'vikings_vinland_1000',
      'nefertiti_bust_sculptor', 'zhang_heng_seismograph', 'laozi_ox_westward', 'su_song_clock_tower',
      'monkey_king_heaven', 'valentines_lace_card', 'suzhou_classical_garden', 'lowicz_polish_folk'],
  },
  ukiyoe: {
    label: 'Ukiyo-e',
    names: ['ukiyo', 'ukiyo e', 'woodblock', 'japanese print'],
    words: ['ukiyo'],
    files: ['kitsune_wedding_sunshower', 'kaguya_hime_moon', 'junihitoe_heian_court', 'hanami_picnic', 'kenrokuen_winter',
      'edo_street_teahouse', 'urashima_taro_ukiyo_e', 'amaterasu_cave', 'moby_dick_whaleboat_chase', 'everest_summit_1953'],
  },
  oilpainting: {
    label: 'Oil painting',
    names: ['oil', 'oil painting', 'painting', 'painterly', 'pre raphaelite', 'preraphaelite'],
    words: ['oil'],
    files: ['declaration_signing_1776', 'dracula_castle_arrival', 'dracula_castle_wall', 'frankenstein_creature_arctic',
      'frankenstein_creation_night', 'lear_storm_heath', 'tempest_shipwreck_storm', 'caesar_crossing_rubicon_49bc',
      'vesuvius_79_misenum', 'elizabeth_i_armada', 'elizabethan_gentleman_1590s', 'dutch_golden_age_1660s',
      'danse_macabre_graveyard', 'headless_horseman_sleepy_hollow', 'spinoza_lens_grinding', 'newton_prism_spectrum',
      'humboldt_chimborazo', 'thanksgiving_cornucopia', 'clipper_ship_racing', 'ancient_mariner_albatross',
      'arthur_barge_avalon', 'ophelia_flowers_brook', 'lady_of_the_lake_excalibur', 'lady_of_shalott_boat',
      'goblin_market', 'erlking_storm_ride', 'thomas_rhymer_elfland_queen', 'fairy_rade_moonlit_wood',
      'queen_mab_hazelnut_chariot'],
  },
  folkart: {
    label: 'Folk art',
    names: ['folk art', 'folk', 'naive', 'rosemaling', 'lacquer', 'palekh', 'tingatinga', 'madhubani'],
    words: ['folk', 'mexican folk', 'madhubani', 'tingatinga', 'russian lacquer', 'alebrije', 'cave painting'],
    files: ['vasilisa_skull_lantern', 'sadko_sea_king', 'great_gate_of_kiev', 'russian_sarafan_kokoshnik',
      'china_poblana_puebla', 'popocatepetl_iztaccihuatl', 'three_billy_goats_gruff', 'swedish_midsummer_maypole',
      'paul_bunyan_babe', 'lowicz_polish_folk', 'mammoths_cave_painting'],
  },
}

const YEAR_TOKEN = /^(\d{3,4})s?$|^(\d{1,4})bc$/

function yearsIn(words: string[]): number[] {
  const out: number[] = []
  for (const w of words) {
    const m = w.match(YEAR_TOKEN)
    if (m) out.push(m[1] !== undefined ? Number(m[1]) : -Number(m[2]))
  }
  return out
}

/** Pad a lowercase label for whole-word phrase matching: " hamlet yorick graveyard ". */
function pad(text: string): string {
  return ' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' '
}

function categoryMatches(key: string, haystack: string, fileId: string | null, seen: Set<string>): boolean {
  if (seen.has(key)) return false
  seen.add(key)
  const cat = SEARCH_CATEGORIES[key]
  if (!cat) return false
  if (cat.requires && !cat.requires.every(k => categoryMatches(k, haystack, fileId, new Set()))) return false
  if (fileId && cat.files?.includes(fileId)) return true
  if (cat.words?.some(w => haystack.includes(' ' + w + ' '))) return true
  if (cat.years) {
    const [lo, hi] = cat.years
    if (yearsIn(haystack.trim().split(' ')).some(y => y >= lo && y <= hi)) return true
  }
  return cat.include?.some(k => categoryMatches(k, haystack, fileId, seen)) ?? false
}

/** Categories a single query term selects: the term is a 3+ letter prefix of one of the category's names. */
export function categoriesForTerm(term: string): string[] {
  const t = term.trim().toLowerCase()
  if (t.length < 3) return []
  return Object.keys(SEARCH_CATEGORIES).filter(k =>
    categoryLabel(k).toLowerCase().startsWith(t) || SEARCH_CATEGORIES[k].names.some(n => n.startsWith(t)))
}

/** Pill text for a category: its label, or its first name capitalized. */
export function categoryLabel(key: string): string {
  const c = SEARCH_CATEGORIES[key]
  return c.label ?? c.names[0].charAt(0).toUpperCase() + c.names[0].slice(1)
}

/**
 * Autocomplete: categories whose label or a name starts with the query
 * (2+ letters), labels first. A category whose label the query already equals
 * is left out -- the pill has done its job.
 */
export function suggestCategories(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const keys = Object.keys(SEARCH_CATEGORIES).filter(k => categoryLabel(k).toLowerCase() !== q)
  const byLabel = keys.filter(k => categoryLabel(k).toLowerCase().startsWith(q))
  const byName = keys.filter(k => !byLabel.includes(k) && SEARCH_CATEGORIES[k].names.some(n => n.startsWith(q)))
  return [...byLabel, ...byName].slice(0, limit)
}

/** How many of the given stock ids fall under a category. */
export function countInCategory(key: string, fileIds: readonly string[]): number {
  return fileIds.filter(id => categoryMatches(key, pad(id), id, new Set())).length
}

/**
 * Build a predicate for a search query. The whole query as a substring of the
 * label always matches (the old behavior: "red fox"). Otherwise every term
 * must match, either as a substring or through a category it selects.
 * `fileId` is the stock id for stock images, null for user gallery prompts.
 */
export function makeSearchMatcher(query: string): (label: string, fileId: string | null) => boolean {
  const q = query.trim().toLowerCase()
  if (!q) return () => true
  const terms = q.split(/\s+/).filter(t => /[a-z0-9]/.test(t))
  const cats = terms.map(categoriesForTerm)
  // The whole query may name a category itself ("stained glass", "20th century").
  const whole = terms.length > 1 || /[^a-z0-9]/.test(q) ? categoriesForTerm(q) : []
  return (label, fileId) => {
    const lower = label.toLowerCase()
    if (lower.includes(q)) return true
    const hay = pad(label)
    if (whole.some(k => categoryMatches(k, hay, fileId, new Set()))) return true
    if (terms.length === 0) return false
    return terms.every((t, i) =>
      lower.includes(t) || cats[i].some(k => categoryMatches(k, hay, fileId, new Set())))
  }
}

/** Every category a stock image falls under (for scripts/search-tags.ts and tests). */
export function categoriesForImage(fileId: string): string[] {
  const hay = pad(fileId)
  return Object.keys(SEARCH_CATEGORIES).filter(k => categoryMatches(k, hay, fileId, new Set()))
}
