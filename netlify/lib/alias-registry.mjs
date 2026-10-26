import { createHash } from 'node:crypto';
import { getStore, getDeployStore } from '@netlify/blobs';
import { FIRST_NAMES } from './anonymous-alias.mjs';
import { env } from './env.mjs';

export const ALIAS_NAMES = Object.freeze([...new Set([...FIRST_NAMES, ...`
Abel Abigail Abraham Ada Adelaide Adele Adeline Aditya Agnes Aidan Aileen Aimee
Alana Alastair Alec Alessandra Alessia Alexis Alfred Alicia Alina Alison Allan Alma
Alonzo Althea Alvin Amara Amelia Amelie Amos Anastasia Anders Anderson Andrei Anika
Annabel Annalise Annette Ansel Anson Anthea Anton Antonio April Arabella Archer Archie
Aria Ariadne Ariel Arlo Armand Arnold Arthurina Arturo Asher Ashley Ashton Astrid Athena
Atticus Aubrey August Augusta Augustine Aurora Avery Axel Ayla Barbara Beatrice Beatrix
Beau Bella Bennett Benson Bernard Bernadette Beryl Bianca Blake Blanche Blythe Bonnie
Boris Bradley Brendan Brent Brett Brianna Bridgette Briony Brock Bronwen Brooke Bryan
Byron Callum Camille Candace Cara Carmen Carol Carolyn Cassandra Cassian Cassidy Cecil
Cecilia Cedric Celeste Celia Chad Chantal Charlene Chester Chiara Christian Christine
Christina Ciara Clarissa Claudia Clayton Clement Cleo Clifford Clint Clive Cody Colette
Conrad Constance Cooper Cora Coral Cordelia Corey Corinne Cornelius Cosmo Courtney Craig
Cristina Curtis Cynthia Cyrus Daisy Dakota Dale Dalton Damian Damon Dana Daphne Darius
Darlene Darrell Darren Darryl Dawn Dawson Dean Declan Deirdre Delia Delilah Delphine
Denise Derek Desmond Dexter Diego Dolores Donovan Dora Dorian Doris Douglas Drake Drew
Duane Duncan Dustin Earl Easton Edgar Edith Edmund Edna Edwin Eileen Elaine Elaina
Elias Elijah Elise Eliza Elliot Elliott Ellis Eloise Elsa Elsie Elton Emanuel Emelda
Emilia Emiliano Emilio Emerson Emmett Emmeline Emrys Enid Enrico Enzo Erin Ernest Esme
Estelle Esther Etta Eugene Eugenia Evan Evangeline Everett Ezekiel Ezra Fabian Faith
Fallon Farah Fatima Faye Felicity Ferdinand Fern Fergus Fernanda Finlay Finn Finnegan
Fletcher Fleur Floyd Flynn Forrest Francesca Francine Francis Franco Franklin Fraser
Freya Frieda Gabriela Gabriella Gabrielle Gail Gareth Garland Garrett Gary Gavin Gene
Genevieve Geoffrey Georgia Georgina Gerald Geraldine Gilbert Gillian Gina Giovanni
Gladys Glen Glenn Gloria Gordon Gracie Grant Greta Gretchen Griffin Grover Gustavo Gwen
Gwendolyn Gwyneth Hadley Hamish Hana Harlow Harmony Harrison Harvey Heath Hector Heidi
Helena Henrietta Henrik Herbert Herman Hermione Hilary Hilda Holden Homer Horace Howard
Hudson Hugo Humphrey Hunter Ida Idris Imani Imelda Imogen India Indigo Ines Ingrid Iona
Irene Iris Irma Irving Isla Isobel Ivan Ivana Ivy Jace Jacinta Jaclyn Jacques Jade
Jaden Jaime Jake Jamal Jamie Jared Jarvis Jasper Javier Jay Jayden Jean Jeanette
Jeanne Jeffrey Jemima Jemma Jenna Jensen Jeremiah Jerome Jerry Jesse Jill Jillian Jim
Joan Joanna Joanne Jocelyn Jodie Joelle Joey Jolene Jonah Jonas Jordan Jorge Josette
Josiah Joyce Juan Judith Judy Jude Juliana Juliet June Juniper Kai Kaitlin Kara Karen
Karina Karl Karla Katelyn Kathleen Kathryn Katie Kay Kayla Keira Kelsey Kendall Kendrick
Kenneth Kent Kieran Killian Kim Kimberly Kirsten Kirsty Knox Krista Kristina Kurt Kyle
Kylie Lachlan Lana Lance Landon Lara Larissa Larry Laurel Laurence Lavinia Lawrence
Layla Leanne Leila Lena Lennox Lenora Leon Leona Leonardo Leonie Leroy Leslie Lester
Letitia Levi Liana Lilian Liliana Lillian Lincoln Lionel Lloyd Logan Lois Lola Lorelei
Lorena Loretta Lorraine Lottie Louise Lucia Lucian Lucille Lucinda Luciano Luther Luz
Mabel Mackenzie Maddox Madeline Madeleine Madison Mae Maeve Magnus Maisie Malcolm
Malik Mallory Mandy Manuel Marc Marcel Marcella Marco Marcus Maren Margery Margot
Marianne Mariana Maribel Marie Marigold Marisa Marjorie Marlene Marshall Marta Matilda
Matteo Maud Maude Maureen Maurice Max Maximilian Maxine Maxwell Maya Mckenna Melody
Melanie Melinda Melissa Meredith Micah Michaela Michelle Miguel Mila Miles Millie Milo
Mina Miranda Miriam Mitchell Moira Monica Morgan Morris Moses Muriel Murray Myles Myra
Nadia Nadine Naomi Natalia Natalie Natasha Neal Nell Nelson Nia Niall Nico Nicola
Nicole Nigel Nina Noel Noelle Nolan Norah Norman Octavia Odette Odin Olive Omar Opal
Ophelia Orlando Orson Otis Otto Pansy Parker Patricia Patsy Pauline Pearl Pedro Peggy
Penelope Percy Perry Petra Peyton Phoebe Phyllis Pierce Piers Pippa Polly Porter Preston
Priscilla Quentin Quincy Quinn Rafael Ralph Ramona Randall Raphael Raquel Raul Regina
Reginald Renee Reuben Rex Rhea Rhoda Rhonda Rhys Ricardo Rita River Roald Roberta
Rochelle Roderick Rodney Roger Roland Roman Ronald Rosa Rosalie Rosalind Rosamund
Rosanna Rosemary Ross Rowan Rowena Roxanne Rufus Rupert Sabrina Sadie Sage Salvatore
Samantha Samson Sandra Saoirse Saskia Saul Savannah Sawyer Scarlett Selena Selina
Serena Seth Shana Shannon Sharon Shaun Sheila Sheldon Sheridan Shiloh Sidney Sienna
Sierra Sigmund Silas Silvia Simone Skylar Solomon Sonia Sonny Sophia Spencer Stacey
Stella Stephanie Sterling Steven Stewart Stuart Summer Susanna Susanne Suzanne Sydney
Sylvester Sylvia Sylvie Tabitha Talia Tamara Tamsin Tanya Tara Taryn Tatiana Taylor
Terence Teresa Terrence Terry Thalia Thea Thelma Theo Theodore Theresa Tobias Todd
Tom Tomas Toni Tony Tracey Travis Trevor Tristan Troy Tucker Una Ulysses Ursula
Valentin Valentine Valerie Vanessa Vaughan Vera Verity Vernon Victor Viola Virginia
Vivian Vivienne Wade Wallace Wanda Warren Wayne Wesley Wilbur Wilfred Wilhelmina
Willow Wilma Winifred Winston Wyatt Xander Xavier Xenia Yara Yasmin Yasmine Yolanda
Yvette Yvonne Zachariah Zachary Zane Zara Zelda Zena Zora
`.trim().split(/\s+/)])]);

// Preserve the known installations from the existing report. The test PC owns
// Joshua; the colliding regular installation receives a new unused first name.
export const LEGACY_ALIASES = Object.freeze({
  'BE-MBQX-QRM7': 'Joshua', 'BE-JQ9R-MUWL': 'Kevin', 'BE-FT5X-CSPB': 'Joseph',
  'BE-TB3Z-6TN8': 'Vincent', 'BE-QH2M-23HQ': 'Leah', 'BE-AG4L-R8FB': 'Dorothy',
  'BE-STVW-85QP': 'Amy', 'BE-E9DH-BJG7': 'Isaac', 'BE-9K3B-SNPG': 'Toby',
  'BE-6CT8-QWAL': 'Richard', 'BE-LNLT-749Q': 'Brian', 'BE-Y3T2-QKSC': 'Holly',
  'BE-KE2S-6X5F': 'Bruce', 'BE-96YV-VZWX': 'David', 'BE-CRCJ-3JEC': 'Stanley',
  'BE-HQS4-6NVE': 'Frederick', 'BE-B4Q6-9R3C': 'Timothy', 'BE-HAD7-9HKG': 'Owen',
});

const validID = value => typeof value === 'string' && /^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(value);
export function createAliasRegistry(store, { names = ALIAS_NAMES, legacy = LEGACY_ALIASES } = {}) {
  const pool = [...new Set(names)];
  if (!pool.length || pool.some(name => !/^[A-Z][a-z]+$/.test(name) || name === 'Unknown')) throw new Error('Invalid alias name pool.');
  const reserved = new Map(Object.entries(legacy).map(([id, name]) => [name, id]));
  if (reserved.size !== Object.keys(legacy).length) throw new Error('Duplicate reserved aliases.');
  const cached = new Map();
  const nameKey = name => `expert-aliases/v2/names/${name.toLowerCase()}`;
  const assigned = async (id, row) => {
    if (!row || typeof row.name !== 'string' || !/^[A-Z][a-z]+$/.test(row.name)) throw new Error('Alias assignment unavailable.');
    const owner = await store.get(nameKey(row.name), { type: 'json' });
    if (owner?.installationId !== id) throw new Error('Alias ownership mismatch.');
    if (cached.size >= pool.length) cached.clear();
    cached.set(id, row.name);
    return row.name;
  };
  return async id => {
    if (!validID(id)) return 'Unknown';
    if (cached.has(id)) return cached.get(id);
    const idKey = `expert-aliases/v2/ids/${id}`;
    const saved = await store.get(idKey, { type: 'json' });
    if (saved !== null) return assigned(id, saved);
    // Both records are immutable create-only claims. The name reservation owns
    // uniqueness; the ID pointer preserves a chosen name as the pool expands.
    // Do not return an alias until its ID pointer has been persisted and checked.
    const preferred = legacy[id];
    const candidates = pool.map(name => ({ name, score: createHash('sha256').update(`alias-v2\0${id}\0${name}`).digest('hex') }))
      .sort((a, b) => (a.name === preferred ? -1 : b.name === preferred ? 1 : a.score.localeCompare(b.score)));
    for (const { name } of candidates) {
      if (reserved.has(name) && reserved.get(name) !== id) continue;
      const key = nameKey(name);
      let claim = await store.get(key, { type: 'json' });
      if (claim === null) {
        const result = await store.setJSON(key, { installationId: id }, { onlyIfNew: true });
        if (result.modified) claim = { installationId: id };
        else claim = await store.get(key, { type: 'json' });
      }
      if (!validID(claim?.installationId)) throw new Error('Alias reservation unavailable.');
      if (claim.installationId === id) {
        const result = await store.setJSON(idKey, { name }, { onlyIfNew: true });
        return assigned(id, result.modified ? { name } : await store.get(idKey, { type: 'json' }));
      }
    }
    throw new Error('Alias name pool exhausted. Add more first names before assigning another installation.');
  };
}

let registry;
export const resolveInstallationAlias = id => {
  if (!validID(id)) return Promise.resolve('Unknown');
  const openStore = env('CONTEXT') === 'production' ? getStore : getDeployStore;
  registry ??= createAliasRegistry(openStore({ name: 'babble-shared-data', consistency: 'strong' }));
  return registry(id);
};
