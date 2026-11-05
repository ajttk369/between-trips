// Keep optimistic checkbox state separate from the saved document. Only the done
// field is sent, so a concurrent name/assignee edit is never overwritten.
export function createTaskUpdates({scope,getTrip,send,read,commit,change,error}){
  const pending=new Map();let currentScope=scope(),running=false,generation=0,sequence=0;
  function reset(){currentScope=scope();generation++;pending.clear();running=false;}
  function checkScope(){if(scope()!==currentScope)reset();}
  function value(task){checkScope();return pending.get(task.id)?.done??task.done;}
  async function drain(){
    if(running)return;running=true;const token=generation,owner=currentScope;let failed=false;
    const active=()=>token===generation&&scope()===owner;
    try{
      while(pending.size&&active()){
        const [id,entry]=pending.entries().next().value;
        try{
          let trip=getTrip();if(!trip.tasks.some(t=>t.id===id))throw Error('준비물이 삭제됐어요.');
          let result;
          try{result=await send(trip.id,{action:'taskDone',itemId:id,done:entry.done,version:trip.version});}
          catch(e){
            if(e.status!==409)throw e;
            const received=await read(trip.id);if(!active())return;
            const latest=received.version>=getTrip().version?received:getTrip();commit(latest);
            const task=latest.tasks.find(t=>t.id===id);if(!task)throw Error('동행이 이 준비물을 삭제했어요.');
            result=task.done===entry.done?latest:await send(latest.id,{action:'taskDone',itemId:id,done:entry.done,version:latest.version});
          }
          if(!active())return;
          // A poll may already have received a newer version than this response.
          if(result.version>=getTrip().version)commit(result);
          if(pending.get(id)?.sequence===entry.sequence)pending.delete(id);
        }catch(e){if(!active())return;failed=true;if(pending.get(id)?.sequence===entry.sequence)pending.delete(id);error(e);}
        if(active())change(pending.size>0,failed);
      }
    }finally{if(active()){running=false;change(false,failed);}}
  }
  function toggle(id){
    checkScope();const task=getTrip()?.tasks.find(t=>t.id===id);if(!task)return;
    pending.set(id,{done:!value(task),sequence:++sequence});change(true,false);void drain();
  }
  return {toggle,value,isPending:id=>{checkScope();return pending.has(id);},reset};
}
