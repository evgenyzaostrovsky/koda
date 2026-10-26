type AuthClient = {auth:{signOut(options:{scope:'local'}):Promise<{error:unknown}>}};
/** Forget this device even if remote revocation or refreshing an expired token fails.
 * Chat storage is deliberately untouched. A second SDK signOut emits SIGNED_OUT
 * after its persisted session is removed, including for other tabs on this origin.
 */
export async function signOutDevice(client:AuthClient,storage:{removeItem(key:string):Promise<unknown>},authKey:string){
  const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
  if(offline)await storage.removeItem(authKey);
  const result=await client.auth.signOut({scope:'local'});
  if(result.error){
    await storage.removeItem(authKey);
    const cleared=await client.auth.signOut({scope:'local'});
    if(cleared.error)throw cleared.error;
  }
}
