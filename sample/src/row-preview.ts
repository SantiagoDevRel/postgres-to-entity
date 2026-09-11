/** Show the encoder's actual output. Never derive a second mapping from source values. */
export function renderRowPreview(host: HTMLElement, display: {attributes: Record<string,unknown>; payload: Record<string,unknown>}) {
  const node = (tag: string, text?: string, className?: string) => {
    const element=document.createElement(tag);
    if(text!==undefined)element.textContent=text;
    if(className)element.className=className;
    return element;
  };
  const attributes=node('section',undefined,'entity-attributes');
  attributes.append(node('h3','Attributes'));
  const list=node('dl',undefined,'attribute-values');list.id='row-attributes';
  for(const [name,value] of Object.entries(display.attributes)) {
    const row=node('div');row.append(node('dt',name),node('dd',JSON.stringify(value)));list.append(row);
  }
  attributes.append(list);
  const payload=node('section',undefined,'entity-payload');payload.append(node('h3','Payload · JSON'));
  const json=node('pre',JSON.stringify(display.payload,null,2));json.id='row-payload';json.tabIndex=0;
  json.setAttribute('aria-label','Payload to be sent');payload.append(json);
  const content=node('div',undefined,'entity-content');content.append(attributes,payload);
  host.replaceChildren(node('p','Your values → Arkiv entity','entity-frame-title'),content);host.hidden=false;
}
