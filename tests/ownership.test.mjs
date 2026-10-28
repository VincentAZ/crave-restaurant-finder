import test from 'node:test';
import assert from 'node:assert/strict';
import {ownershipFor} from '../dist/ownership.js';
const checkedDate=new Date('2026-11-01T12:00:00Z');
const phoenix={lat:33.7,lng:-112.1};

test('documented Phoenix-area ownership earns a Local badge with evidence',()=>{
 for(const [name,website] of [['Someburros','https://www.someburros.com/locations'],["Sardella’s Pizza & Wings",'https://sardellaspizza.com'],['Osteria Mia','https://www.osteriamia.com']]){
  const result=ownershipFor({...phoenix,name,website},checkedDate);
  assert.equal(result.local,true,name);assert.equal(result.label,'Local');
  assert.ok(result.sources.every(s=>s.url.startsWith('https://')));assert.equal(result.reviewedOn,'2026-10-28');
 }
});
test('unknown restaurants and franchises are not presumed local or non-local',()=>{
 for(const name of ['Neighborhood Kitchen',"McDonald's",'Five Guys']){
  const result=ownershipFor({...phoenix,name},checkedDate);
  assert.equal(result.local,false);assert.equal(result.label,'Local ownership unverified');
 }
});
test('same name elsewhere or a conflicting website cannot inherit the Local badge',()=>{
 assert.equal(ownershipFor({name:'Someburros',lat:40.7,lng:-74},checkedDate).local,false);
 assert.equal(ownershipFor({...phoenix,name:'Someburros',website:'https://someburros.com.example.com'},checkedDate).local,false);
 assert.equal(ownershipFor({...phoenix,name:'Osteria Mia',website:'https://different-business.com'},checkedDate).local,false);
});
test('ownership evidence expires instead of remaining authoritative forever',()=>{
 assert.equal(ownershipFor({...phoenix,name:'Someburros'},new Date('2027-05-01')).local,false);
 assert.equal(ownershipFor({...phoenix,name:'Someburros'},new Date('invalid')).local,false);
});
