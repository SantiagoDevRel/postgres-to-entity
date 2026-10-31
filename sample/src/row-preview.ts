/** Show the encoder's actual output. Never derive a second mapping from source values. */
export function renderRowPreview(host: HTMLElement, display: {indexed: Record<string,unknown>; stored: Record<string,unknown>}) {
  const node = (tag: string, text?: string, className?: string) => {
    const element=document.createElement(tag);
    if(text!==undefined)element.textContent=text;
    if(className)element.className=className;
    return element;
  };
  const attributes=node('section',undefined,'entity-attributes');
  attributes.append(node('h3','Indexed columns'));
  const list=node('dl',undefined,'attribute-values');list.id='row-attributes';
  for(const [name,value] of Object.entries(display.indexed)) {
    const row=node('div');row.append(node('dt',name),node('dd',JSON.stringify(value)));list.append(row);
  }
  attributes.append(list);
  const stored=node('section',undefined,'entity-stored');stored.append(node('h3','Stored columns · JSON'));
  const json=node('pre',JSON.stringify(display.stored,null,2));json.id='row-stored';json.tabIndex=0;
  json.setAttribute('aria-label','Stored columns to be sent');stored.append(json);
  const content=node('div',undefined,'entity-content');content.append(attributes,stored);
  host.replaceChildren(node('p','Your values → Arkiv entity','entity-frame-title'),content);host.hidden=false;
}
