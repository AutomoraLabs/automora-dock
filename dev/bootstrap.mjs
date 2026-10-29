export function bootstrapDocument(html,library,token){
  const payload=JSON.stringify({library,token}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return html.replace('<div id="root"></div>',`<script type="application/json" id="automora-bootstrap">${payload}</script><div id="root"></div>`);
}
