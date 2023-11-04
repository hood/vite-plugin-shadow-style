# vite-plugin-shadow-style

<center>
  <img src="logo.png" />
</center>

## What it does
This plugin allows you to inject css styles into the shadow root of your web
components.


## How to use it
Declare your entry point like this:

```tsx
export function defineEntry() {
  class MyComponentEntry extends HTMLElement {
    public static Name = "my-component";
    private mountPoint!: HTMLDivElement;

    constructor() {
      super();
    }

    connectedCallback() {
      this.mountPoint = document.createElement("div");

      // This is the important part, where you're creating a style tag to
      // inject into the shadow root.
      const style = document.createElement("style");
      style.innerHTML = SHADOW_STYLE;

      const shadowRoot = this.attachShadow({ mode: "open" });

      shadowRoot.appendChild(this.mountPoint);
      shadowRoot.appendChild(style);

      ReactDOM.createRoot(this.mountPoint).render(<MandGBreakdown />);
    }
  }

  window.customElements.get(MyComponentEntry.Name) ||
    window.customElements.define(MyComponentEntry.Name, MyComponentEntry);
}

defineEntry();
```


At this point, you'll probably get errors regarding `SHADOW_STYLE` not being 
defined. To obviate this, you can create a `globals.d.ts` file in your project's
root folder and add the following to it:

```ts
declare const SHADOW_STYLE: string;
```


Now, all you'll need to do is load the plugin in your vite configuration, as the
last item in the `plugins` array:

```ts
export default defineConfig({
  build: {
    rollupOptions: {
      plugins: [
        react(),
        typescript({
          noEmit: true,
          allowImportingTsExtensions: true,
        }),
        // Here it goes!
        shadowStyle(),
      ],
    },
    minify: true,
    sourcemap: true,
    outDir: "dist",
  },
});
```