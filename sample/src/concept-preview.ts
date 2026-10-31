import { help } from './help';

const node = (tag: string, text?: string) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
};

/** A deliberately small excerpt, never a source of model or transaction data. */
export function conceptPreview(host: HTMLElement, section: 'attributes' | 'stored', kind: string,
  attributes: [string, unknown][], stored: Record<string, unknown>) {
  const entity = node('div'); entity.className = 'mini-entity';
  const title = node('header'); title.append(node('strong', kind), node('small', 'Entity · example excerpt'));
  entity.append(title);
  const columnSection = node('section'); columnSection.dataset.miniSection = 'attributes';
  columnSection.append(node('h3', 'Indexed columns'));
  const list = node('dl');
  for (const [name, value] of attributes) {
    const row = node('div'); row.append(node('dt', name), node('dd', JSON.stringify(value))); list.append(row);
  }
  columnSection.append(list);
  const storedSection = node('section'); storedSection.dataset.miniSection = 'stored';
  storedSection.append(node('h3', 'Stored columns'), node('pre', JSON.stringify(stored, null, 2)));
  (section === 'attributes' ? columnSection : storedSection).classList.add('mini-highlight');
  entity.append(columnSection, storedSection);
  host.tabIndex = 0; host.setAttribute('role', 'button');
  help((section === 'attributes' ? 'indexed columns' : 'stored columns') + ' example', entity, { trigger: host, visual: true });
}
