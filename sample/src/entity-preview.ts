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
    return value;
  }
  if (/^(bool|boolean)$/.test(lower)) return typeof known==='boolean'?known:false;
  if (/^(i32|int|integer|smallint|int2|int4|serial|smallserial)$/.test(lower)) return typeof known==='number'?known:1;
  if (/^(dec|bigint|bigserial|int8|numeric|decimal)/.test(lower)) return '1';
  if (/^(json|jsonb)$/.test(lower)) return typeof known==='object'?known:{};
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

/** SDK metadata and decoded JSON illustration, separate from the exported model. */
export function entityPreview(entity: EntityDesign, model: EntityModel, flags: DemoFlags, onFlags: (flags: DemoFlags) => void) {
  const relationship = entity.cardinality.startsWith('One relationship');
  const section = node('section', undefined, 'entity-preview');
  section.setAttribute('aria-label', 'Complete entity preview');
  const heading = node('div', undefined, 'panel-head');
  heading.append(node('h3', 'One row → one entity'), node('span', 'Example values', 'hint'));
  section.append(heading);
  const frame = node('div', undefined, 'entity-frame');
  frame.append(node('p', entity.kind, 'entity-frame-title'));
  const metadata = node('dl', undefined, 'entity-metadata');
  const fields = [
    ['key', 'Entity key', '0x…', 'Derived when the entity is created', 'SDK 0.8 derives the key with keccak256 over packed chain ID, Arkiv registry address, creating account, its entity nonce and salt. predictEntityKey can calculate it before sending the creation transaction. This is not the source primary key or a hash of your payload.'],
    ['owner', 'Entity owner', '0x…', entity.owner ? 'Owner policy: ' + entity.owner : 'Wallet address supplied when creating the entity', 'Built-in ownership metadata. Your application supplies the real address; The model generator does not choose a wallet. Ownership can later be transferred separately.'],
    ['creator', 'Entity creator', '0x…', 'Signing account at entity creation', 'The account that creates the entity. This stays as the original creator if ownership changes.'],
    ['createdAt', 'Created at', '<block number>', 'Set at entity creation', 'The creation block number, not a date or timestamp. Deploying the dapp does not create this entity.'],
    ['updatedAt', 'Updated at', '<block number>', 'Starts at createdAt; changes on patch', 'Both start at the creation block. updatedAt then tracks the latest content patch; these are block numbers, not dates.'],
    ['expiresAt', 'Entity Expiration', '<block number>', entity.expiration ?? 'Set from your expiration policy at creation', 'The expiration block is chosen when creating the entity. extendEntity can extend its lifetime.'],
    ['contentType', 'Content type', 'application/json', 'Encoding illustrated below', 'This preview illustrates a UTF-8 JSON payload. Use jsonToPayload with application/json when implementing that encoding. Other payload formats are possible.']
  ];
  fields.forEach(([key,label,value,caption,explanation])=>{
    const row=node('div');row.dataset.entityField=key;
    const term=node('dt',label);term.append(help(label,explanation));
    const definition=node('dd');definition.append(node('code',value),node('small',caption));
    row.append(term,definition);metadata.append(row);
  });
  const flagRow=node('div');flagRow.dataset.entityField='creationFlags';flagRow.className='creation-flags';
  const flagLabel=node('dt');const flagIcon=node('span','🚩 ');flagIcon.setAttribute('aria-hidden','true');
  flagLabel.append(flagIcon,document.createTextNode('Creation settings · flags'));flagRow.append(flagLabel);
  const flagDefinition=node('dd');flagDefinition.append(node('small','Fixed when created; cannot change later.'));
  const controls=node('div',undefined,'flag-controls');
  for(const [name,labelText,description] of [
    ['readonly','Lock the content','Lock attributes and payload against future changes.'],
    ['permissionlessExtension','Let anyone extend expiration','Allow other wallets to keep the entity alive.']
  ] as const){
    const control=node('div');const label=node('label',labelText);label.append(node('small',name));label.htmlFor='flag-'+name;
    const select=node('select');select.id=label.htmlFor;select.dataset.creationFlag=name;
    for(const value of ['false','true']){const meaning=name==='readonly'?(value==='true'?'Locked':'Editable'):(value==='true'?'Anyone':'Owner only');const option=node('option',value+' · '+meaning);option.value=value;select.append(option);}
    select.value=String(flags[name]);
    select.addEventListener('change',()=>{flags={...flags,[name]:select.value==='true'};onFlags({...flags});});
    control.append(label,select,node('small',description));controls.append(control);
  }
  flagDefinition.append(controls);flagRow.append(flagDefinition);
  const attributes=node('section',undefined,'entity-attributes');attributes.dataset.entityField='attributes';
  const attributeHeading=node('h3','Attributes');attributeHeading.append(help('entity attributes','These are the values your app filters on. ds and kind are fixed labels chosen by the model. Other attributes contain values from the selected source fields. The examples here are illustrative, and are not included in your agent handoff.'));
  attributes.append(attributeHeading,node('p','Find entities by these values.','hint'));
  const attributeList=node('dl',undefined,'attribute-values');
  entity.attributes.forEach(attribute=>{
    const row=node('div');row.dataset.attribute=attribute.name;
    const term=node('dt',attribute.name);
    const origin=attribute.source?''
      :attribute.name==='parent'?'Resolved parent entity key':attribute.name==='ds'?'Project name':attribute.name==='kind'?'Entity type':'Fixed by the model';
    term.append(node('small',attribute.type+(origin?' · '+origin:'')));
    const value=attribute.source?exampleValue(attribute.source.table,attribute.source.column,attribute.sourceType??attribute.type,attribute.encoding)
      :attribute.name==='ds'?model.project:attribute.name==='kind'?entity.kind:'0x…';
    row.append(term,node('dd',JSON.stringify(value)));attributeList.append(row);
  });
  attributes.append(attributeList);
  const payload=node('section',undefined,'entity-payload');payload.dataset.entityField='payload';
  const payloadHeading=node('h3','Payload · JSON');payloadHeading.append(help('payload JSON','This is illustrative decoded JSON, using example values because a schema contains no rows. The SDK encodes this JSON into bytes. Scalar values stored in attributes are omitted here. The exported model contains mappings and types, never these illustrative values.'));
  payload.append(payloadHeading,node('p',relationship?'The position of this array element.':'Read this content after finding an entity.','hint'));
  const metadataFields=entity.payloadMetadata??[];
  const payloadObject=Object.fromEntries([
    ...entity.payload.map(field=>[field.source.column,exampleValue(field.source.table,field.source.column,field.sourceType)]),
    ...metadataFields.map(field=>[field.name,0])
  ]);
  const json=node('pre',JSON.stringify(payloadObject,null,2));json.id='payload-json';json.tabIndex=0;json.setAttribute('aria-label','Illustrative payload JSON');
  payload.append(json);
  const content=node('div',undefined,'entity-content');content.append(attributes,payload);frame.append(content);
  const system=node('details',undefined,'system-fields');system.append(node('summary','System fields · key, owner & dates'),metadata);frame.append(system);
  const settings=node('dl',undefined,'entity-metadata entity-settings');settings.append(flagRow);frame.append(settings);section.append(frame);
  return section;
}
