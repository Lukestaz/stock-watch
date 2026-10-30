export function createLatestLoader({read,commit,failed=()=>{}}) {
  let version=0, pending=false, running=null;
  async function drain() {
    while(pending) {
      pending=false;
      const ticket=version;
      try {
        const value=await read();
        if(ticket===version)commit(value);
      } catch(error) {
        if(ticket===version)failed(error);
      }
    }
  }
  function start() {
    running=Promise.resolve().then(drain).finally(()=>{
      running=null;
      if(pending)return start();
    });
    return running;
  }
  return function load() {
    version++;
    pending=true;
    return running || start();
  };
}
