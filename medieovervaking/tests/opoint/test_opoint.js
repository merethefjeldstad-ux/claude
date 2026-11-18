// Node-test av rene funksjoner i Opoint.gs. Kjør: node tests/opoint/test_opoint.js
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../../Opoint.gs', 'utf8'), ctx);
const f = ctx;

const b = f.opointByggBody('x', 100, 200, '');
assert.deepStrictEqual(JSON.parse(JSON.stringify(b)), {searchterm:'x',params:{requestedarticles:10,context:'',oldest:100,newest:200,groupidentical:1,identical:{inherit:true},main:{header:1,summary:1}}});
assert.ok(!('text' in b.params.main) && !('textrazor' in b.params) && !('readership' in b.params));

assert.strictEqual(f.opointTolkSvar(401, '{"detail":"bad"}').ok, false);
assert.ok(f.opointTolkSvar(401, '').feil.includes('tomt'));
assert.ok(f.opointTolkSvar(200, '').feil.includes('tomt'));
assert.ok(f.opointTolkSvar(200, '<html>').feil.includes('Parsefeil'));
assert.ok(f.opointTolkSvar(200, '{"a":1}').feil.includes('Toppnivåfelt: a'));
assert.strictEqual(f.opointTolkSvar(200, '{"searchresult":{"context":"abc"}}').ok, true);

assert.strictEqual(f.opointHentDokumenter({document:[1,2]}).liste.length, 2);
assert.strictEqual(f.opointHentDokumenter({documents:5, document:[1]}).kilde, 'searchresult.document');
assert.strictEqual(f.opointHentDokumenter({documents:[1,2,3]}).liste.length, 3);
assert.strictEqual(f.opointHentDokumenter({}).liste.length, 0);

assert.strictEqual(f.opointHentContext({}), '');
assert.strictEqual(f.opointHentContext({context:null}), '');
assert.strictEqual(f.opointHentContext({context:'q1'}), 'q1');

assert.strictEqual(f.opointFinnTotalFelt({documents:10, range_count:55, context:'x', document:[]}), 'documents=10; range_count=55');

assert.strictEqual(f.opointTellIdentiske({}), '');
assert.strictEqual(f.opointTellIdentiske({identical_documents:[1,2]}), 2);
assert.strictEqual(f.opointTellIdentiske({identical_documents:{cnt:4, document:[1]}}), 4);
assert.strictEqual(f.opointTellIdentiske({identical_documents:{document:[1,2,3]}}), 3);

assert.strictEqual(f.opointMaskerNokkel('Token SECRET123 feil', 'SECRET123'), 'Token *** feil');

const lang = 'x'.repeat(400);
const rad = f.opointArtikkelRad('q', {unix_timestamp:0, header:{text:'T'}, summary:{text:lang}, url:'u', language:{text:'en'}, countrycode:'NO', id_site:1, id_article:2, identical_documents:[1]}, d => d.toISOString());
assert.strictEqual(rad[1], '1970-01-01T00:00:00.000Z');
assert.strictEqual(rad[2], 'T');
assert.strictEqual(rad[4].length, 301);
assert.strictEqual(rad[9], 1);
assert.strictEqual(rad.length, 12);
console.log('Alle Opoint-tester OK');
