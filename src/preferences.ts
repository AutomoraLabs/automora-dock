export const defaultPreferences:Record<string,string>={
 'pd-workspace-rail':'true','pd-force-maximized':'false','pd-theme':'system',
 'pd-remember-scroll':'false','pd-background':'blush','pd-background-intensity':'45',
 'pd-folders-expanded':'false',
};
export function initializePreferences(storage:Pick<Storage,'getItem'|'setItem'>=localStorage){
 for(const [key,value] of Object.entries(defaultPreferences))if(storage.getItem(key)===null)storage.setItem(key,value);
}
