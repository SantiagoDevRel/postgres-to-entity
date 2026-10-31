import {sourceColumns} from './model-columns';
import type { EntityDesign, EntityModel } from 'postgres-to-entity';
import { help } from './help';
import type { DemoFlags } from './creation-flags';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

/** Illustrative values only. These never enter the engine contract, clipboard or downloads. */
export function exampleValue(table: string, column: string, type: string, encoding = ''): unknown {
  const familiar: Record<string, Record<string, unknown>> = {
    tickets: {id:'00000000-0000-4000-8000-000000000001', event_name:'Friday concert', seat_number:12, used:false},
    tasks: {id:'00000000-0000-4000-8000-000000000001',title:'Book the venue',completed:false},
    users: {id:'00000000-0000-4000-8000-000000000001',username:'alex'},
    posts: {id:'00000000-0000-4000-8000-000000000002',author_id:'00000000-0000-4000-8000-000000000001',body:'See you at the concert!',likes:12},
    notes: {id:'note-1',notebook:'Travel',text:'Bring a camera',metadata:{category:'packing'}}
  };
  // Only use familiar values when their type still matches an edited schema.
  const known = Object.hasOwn(familiar,table) && Object.hasOwn(familiar[table],column) ? familiar[table][column] : undefined;
  const lower=type.toLowerCase();
  const dimensions=lower.match(/\[\d*\]/g);
  if (dimensions) {
    let value=exampleValue(table,column,lower.replace(/\[\d*\]/g,''));
    for(const _dimension of dimensions)value=[value];
    return {values:value,lowerBounds:dimensions.map(()=>1)};
  }
  if (/^(bool|boolean)$/.test(lower)) return typeof known==='boolean'?known:false;
  if (/^(i32|int|integer|smallint|int2|int4|serial|smallserial)$/.test(lower)) return typeof known==='number'?known:1;
  if (/^(dec|bigint|bigserial|int8|numeric|decimal)/.test(lower)) return '1';
  if (/^(json|jsonb)$/.test(lower)) return {value: typeof known==='object'?known:{}};
  if (lower==='date') return '2026-09-18';
  if (/^(timestamp|timestamptz)/.test(lower)) return '2026-09-18T18:00:00'+(lower.startsWith('timestamptz')||lower.includes('with time zone')?'Z':'');
  if (lower==='uuid') return typeof known==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(known)?known:'00000000-0000-4000-8000-000000000001';
  if (/^(str|text|string|varchar|character varying)/.test(lower)) {
    let value=typeof known==='string'?known:'x';
    const characters=lower.match(/\((\d+)\)/);
    if(characters)value=[...value].slice(0,Number(characters[1])).join('');
    const byteBound=encoding.match(/maximum (\d+) bytes/);
    if(byteBound)while(new TextEncoder().encode(value).length>Number(byteBound[1]))value=[...value].slice(0,-1).join('');
    return value;
  }
  if (/^(bytea|bytes)$/.test(lower)) return 'AA==';
  return '<' + type + ' value>';
}

/** Illustrations never enter the exported model or submitted values. */
export function entityPreview(entity: EntityDesign, _model: EntityModel, flags: DemoFlags, onFlags: (flags: DemoFlags) => void) {
  const section=node('section',undefined,'entity-preview');
  section.setAttribute('aria-label','Complete entity preview');
  const heading=node('div',undefined,'panel-head');
  heading.append(node('h3','One row to one entity'),node('span','Example values','hint'));section.append(heading);
  const frame=node('div',undefined,'entity-frame');frame.append(node('p',entity.schema.name,'entity-frame-title'));
  const content=node('div',undefined,'entity-content');
  for(const indexed of [true,false]){
    const group=node('section',undefined,indexed?'entity-attributes':'entity-stored');
    group.dataset.entityField=indexed?'attributes':'columns';
    const title=node('h3',indexed?'Indexed columns':'Stored columns');
    title.append(help(indexed?'indexed columns':'stored columns',indexed?'Filter on these typed columns. Only explicit query selections are indexed.':'Read these typed columns after finding an entity. Binary and JSON content use bytes columns without an index.'));
    group.append(title);
    const list=node('dl',undefined,'attribute-values');
    for(const column of entity.schema.columns.filter(c=>c.indexed===indexed)){
      const row=node('div');row.dataset.attribute=column.name;
      const term=node('dt',column.name);term.append(node('small',column.type));
      const value=column.source?exampleValue(column.source.table,column.source.column,column.sourceType??column.type,column.encoding):column.name==='ordinal'?0:'<resolved parent key>';
      row.append(term,node('dd',JSON.stringify(value)));list.append(row);
    }
    group.append(list);content.append(group);
  }
  frame.append(content);
  const system=node('details',undefined,'system-fields');system.append(node('summary','System fields and Entity Expiration'));
  system.append(node('p','$key, $owner, $creator and $expiresAt are system fields. Source primary keys stay in their own columns.','hint'));
  system.append(node('p','Owner: '+(entity.owner??'Decision needed')+'. Entity Expiration: '+(entity.expiration??'Decision needed')+'. Maximum 7,883,970 blocks; longer retention needs authorized Lifetime Extension.','hint'));frame.append(system);
  const settings=node('div',undefined,'flag-controls');
  for(const [name,label] of [['readonly','Lock the content'],['permissionlessExtension','Let anyone extend expiration']] as const){
    const wrap=node('div'),labelNode=node('label',label),select=node('select');select.id='flag-'+name;select.dataset.creationFlag=name;labelNode.htmlFor=select.id;
    for(const value of ['false','true']){const option=node('option',value);option.value=value;select.append(option);}select.value=String(flags[name]);
    select.addEventListener('change',()=>{flags={...flags,[name]:select.value==='true'};onFlags({...flags});});wrap.append(labelNode,select);settings.append(wrap);
  }
  const flagRow=node('div',undefined,'creation-flags');flagRow.dataset.entityField='creationFlags';
  const flagLabel=node('dt'),icon=node('span','🚩 ');icon.setAttribute('aria-hidden','true');
  flagLabel.append(icon,document.createTextNode('Creation settings · flags'));
  const definition=node('dd');definition.append(node('small','Fixed when created; cannot change later.'),settings);flagRow.append(flagLabel,definition);
  const settingsList=node('dl',undefined,'entity-metadata entity-settings');settingsList.append(flagRow);
  frame.append(settingsList);section.append(frame);return section;
}
