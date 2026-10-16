'use strict';
let mounted, theme='light';
function mount() {
  mounted?.destroy();
  const mode=document.querySelector('#mode').value;
  const api=TopflowDeviceAPI.create({mode:'mock', snapshot:TF_FIXTURES[mode]});
  mounted=TopFlowUI.mount(document.querySelector('#screen'), {api, demo:true, control:false, theme, mode,
    state:TopflowDeviceAPI.normalize(TF_FIXTURES[mode]), history:TF_FIXTURES[mode+'History'], poll:false});
}
document.querySelector('#mode').addEventListener('change', mount);
document.querySelector('#theme').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';mount()});
mount();
