import { closeHelp } from './help';

type Step = 1 | 2 | 3;

/** Navigation changes visibility only. The form and edited row stay mounted. */
export function initJourney() {
  const root=document.querySelector<HTMLElement>('.workspace')!;
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-go-step]')];
  let current:Step=1;
  const unlocked=new Set<Step>([1]);
  function sync(){
    root.dataset.currentStep=String(current);
    for(const button of buttons){
      const step=Number(button.dataset.goStep) as Step;
      button.disabled=!unlocked.has(step);
      if(button.closest('.step-nav')){
        if(step===current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
        button.dataset.complete=String(step<current&&unlocked.has(step));
      }
    }
    document.getElementById('journey-status')!.textContent='Step '+current+' of 3';
  }
  function show(step:Step,focus=true){
    if(!unlocked.has(step))return;
    closeHelp();current=step;sync();
    if(focus){const heading=document.querySelector<HTMLElement>('[data-step-panel="'+step+'"] h2')!;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});}
  }
  function reveal(target:HTMLElement){
    const panel=target.closest<HTMLElement>('[data-step-panel]');
    if(panel)show(Number(panel.dataset.stepPanel) as Step,false);
    for(let parent:HTMLElement|null=target;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
  }
  for(const button of buttons)button.addEventListener('click',()=>show(Number(button.dataset.goStep) as Step));
  document.addEventListener('journey-reveal',event=>reveal((event as CustomEvent<HTMLElement>).detail));
  sync();
  return {
    show,
    reveal,
    ready(step:Step){unlocked.add(step);sync();},
    reset(){unlocked.clear();unlocked.add(1);show(1,false);},
    invalidateModel(){unlocked.delete(3);if(current===3)current=2;sync();}
  };
}
