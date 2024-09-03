import {
	App,
	Component,
	debounce,
	Editor,
	MarkdownEditView,
	MarkdownFileInfo,
	MarkdownPostProcessorContext,
	MarkdownRenderer,
	MarkdownSectionInformation,
	MarkdownView,
	Modal,
	Notice,
	parseYaml,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
} from "obsidian";
import {
	EmbeddableMarkdownEditor,
	MarkdownEditorProps,
} from "src/EmbeddableMarkdownEditor";

// Remember to rename these classes and interfaces!

interface TextBlocksSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: TextBlocksSettings = {
	mySetting: "default",
};

export default class TextBlocks extends Plugin {
	settings: TextBlocksSettings;

	async onload() {
		await this.loadSettings();

		new Notice("hiiii");

		this.registerMarkdownCodeBlockProcessor("text-blocks", (...props) => {
			registerCodeblock(this, ...props);
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: TextBlocks;

	constructor(app: App, plugin: TextBlocks) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

type CodeBlockRegisterHandler = (
	plugin: TextBlocks,
	source: string, // content of the code block. Does *not* include the backticks from top and bottom
	el: HTMLElement, // the code block element
	ctx: MarkdownPostProcessorContext
) => Promise<void> | void;

const registerCodeblock: CodeBlockRegisterHandler = async (
	plugin,
	sourceText,
	el,
	ctx
) => {
	// Have to wait for DOM to render
	await new Promise((res) => setTimeout(res, 0));
	el.parentElement!.style.boxShadow = "none";
	el.parentElement!.style.overflow = "visible";
	el.parentElement!.style.display = "inline-block";
	// containerEl.appendChild(el);
	const arr = sourceText.split("\n---\n");
	const [arr0, ...arrRest] = arr;
	const source = arr.length === 1 ? arr0 : [...arrRest].join("\n---\n"); // if user has `---` in the text, it will also get split, this rejoins them
	const configText = arr.length === 1 ? "" : arr0;
	const config: Record<string, any> = parseYaml(configText) ?? {};
	console.log("el: ", el);
	if (config.class) {
		el.className += " " + config.class;
	}
	if (config.style) {
		el.setAttribute("style", config.style);
	}
	if (config.parentClass && el.parentElement) {
		el.parentElement.className += " " + config.parentClass;
	}
	if (config.parentStyle && el.parentElement) {
		el.parentElement.setAttribute(
			"style",
			"box-shadow: none; overflow: visible; display: inline-block; " +
				config.parentStyle
		);
	}
	el.empty();
	// const leaf = findLeaf(plugin.app, el.parentElement!);
	const workspaceEditor = findEditor(plugin.app, el);
	if (!workspaceEditor) {
		// TODO handle better
		// if editor doesn't exist on render (like in reading view, then we don't care about updates)
		// because editing should be disabled in reading view
		return;
	}
	const getSectionInfo = () => ctx.getSectionInfo(el);
	// const emde = new EmbeddableMarkdownEditor(plugin.app, el, {
	// 	// onChange: (...props) =>
	// 	// 	onEmdeUpdate(workspaceEditor, getSectionInfo, ...props),
	// 	value: source,
	// });
	const emde = new EmbeddableMarkdownEditor(plugin.app, el, {
		// onChange: (...props) =>
		// 	onEmdeUpdate(workspaceEditor, getSectionInfo, ...props),
		value: source,
	});

	el.addEventListener("focusout", (e) => {
		if (!emde) return;
		const md = emde.editor?.getValue() ?? "";
		// no changes made
		if (md === source) return;
		const txt = configText ? configText + "\n---\n" + md : md;
		const sectionInfo = getSectionInfo();
		if (!sectionInfo) return;
		const { lineStart, lineEnd } = sectionInfo;
		if (!workspaceEditor.editor) return;
		workspaceEditor.editor.replaceRange(
			txt,
			{ ch: 0, line: lineStart + 1 },
			{ ch: NaN, line: lineEnd - 1 }
		);
	});
};

type OnEmdeUpdateParams = [
	workspaceEditor: MarkdownFileInfo,
	getSectionInfo: () => MarkdownSectionInformation | null,
	...Parameters<MarkdownEditorProps["onChange"]>
];

const onEmdeUpdate = debounce<OnEmdeUpdateParams, void>(
	(workspaceEditor, getSectionInfo, update, editor) => {
		if (!workspaceEditor.editor) return;
		// @ts-ignore Private API (not in obsidian-typings)
		const lines = update.state.doc.text as string[];
		const sectionInfo = getSectionInfo();
		if (!sectionInfo) return;
		const { lineStart, lineEnd } = sectionInfo;
		workspaceEditor.editor.replaceRange(
			lines.join("\n"),
			{ ch: 0, line: lineStart + 1 },
			{ ch: NaN, line: lineEnd - 1 }
		);
	},
	500,
	true
);

// can't figure out to get the editor from a leaf, so scrapping for now
const findLeaf = (app: App, codeblockEl: HTMLElement) => {
	const leaves = app.workspace.getLeavesOfType("markdown");
	for (const leaf of leaves) {
		if (!leaf.view.containerEl.contains(codeblockEl)) continue;
		return leaf;
	}
	return null;
};

const findEditor = (app: App, codeblockEl: HTMLElement) => {
	const editor = app.workspace.activeEditor;
	// can't figure out a way to get leaf from editor
	// if I could get the leaf, I could verify the codeblockEl is within it :/
	return editor;
};
