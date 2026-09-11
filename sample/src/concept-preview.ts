import { help } from './help';

const node = (tag: string, text?: string) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
};

/** A deliberately small excerpt, never a source of model or transaction data. */
export function conceptPreview(host: HTMLElement, section: 'attributes' | 'payload', kind: string,
  attributes: [string, unknown][], payload: Record<string, unknown>) {
  const entity = node('div'); entity.className = 'mini-entity';
  const title = node('header'); title.append(node('strong', kind), node('small', 'Entity · example excerpt'));
  entity.append(title);
  const attributeSection = node('section'); attributeSection.dataset.miniSection = 'attributes';
  attributeSection.append(node('h3', 'Attributes'));
  const list = node('dl');
  for (const [name, value] of attributes) {
    const row = node('div'); row.append(node('dt', name), node('dd', JSON.stringify(value))); list.append(row);
  }
  attributeSection.append(list);
  const payloadSection = node('section'); payloadSection.dataset.miniSection = 'payload';
  payloadSection.append(node('h3', 'Payload · JSON'), node('pre', JSON.stringify(payload, null, 2)));
  (section === 'attributes' ? attributeSection : payloadSection).classList.add('mini-highlight');
  entity.append(attributeSection, payloadSection);
  const trigger = help(section + ' in an entity', entity, { hoverTarget: host, visual: true });
  trigger.className = 'text-button concept-preview-trigger'; trigger.textContent = 'View entity ↗';
  trigger.setAttribute('aria-label', 'Preview entity ' + section);
  host.querySelector('.concept-preview-trigger')?.remove(); host.append(trigger);
}
