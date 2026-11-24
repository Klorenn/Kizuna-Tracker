/** Whether the WebView already holds a web session for this user in this app run: one handoff is enough unless it lands on /login. */
let linkedUser: string | null = null;

export const markWebLinked = (userId: string) => void (linkedUser = userId);
export const isWebLinked = (userId: string) => linkedUser !== null && linkedUser === userId;
export const clearWebLinked = () => void (linkedUser = null);
