import fsOperation from "fileSystem";
import Page from "components/page";
import helpers from "utils/helpers";
import Url from "utils/Url";
import actionStack from "./actionStack";

export default async function loadPlugin(pluginId, justInstalled = false) {
	const baseUrl = await helpers.toInternalUri(Url.join(PLUGIN_DIR, pluginId));
	const cacheFile = Url.join(CACHE_STORAGE, pluginId);

	const pluginJson = await fsOperation(
		Url.join(PLUGIN_DIR, pluginId, "plugin.json"),
	).readFile("json");

	let mainUrl = pluginJson.main;
	if (!(await fsOperation(Url.join(PLUGIN_DIR, pluginId, mainUrl)).exists())) {
		mainUrl = `main.js`;
	}
	mainUrl = Url.join(baseUrl, mainUrl);

	const isESM = pluginJson.type === "module";
	const $script = isESM ? null : <script src={mainUrl}></script>;
	try {
		const { promise, resolve, reject } = Promise.withResolvers();
		if (isESM) {
			const urlObj = new URL(mainUrl);
			urlObj.searchParams.set("acodeTs", performance.now());
			resolve(import(urlObj));
		} else {
			$script.addEventListener("error", () => reject());
			$script.addEventListener("load", resolve);
			document.head.append($script);
		}
		try {
			await promise;
		} catch (error) {
			let name, stack, msg;
			if (error) ({ name, stack, message: msg } = error);
			msg =
				`Failed to load ${isESM ? "module " : ""}` +
				`script for plugin "${pluginId}"` +
				(msg ? `: ${msg}` : ".");
			error = new Error(msg, { cause: error });
			error.name = name;
			error.stack = stack;
			throw error;
		}
	} finally {
		$script?.remove();
	}

	const $page = Page("Plugin");
	$page.show = () => {
		actionStack.push({
			id: pluginId,
			action: $page.hide,
		});

		app.append($page);
	};

	$page.onhide = () => actionStack.remove(pluginId);

	if (!(await fsOperation(cacheFile).exists())) {
		await fsOperation(CACHE_STORAGE).createFile(pluginId);
	}

	await acode.initPlugin(pluginId, baseUrl, $page, {
		cacheFileUrl: await helpers.toInternalUri(cacheFile),
		cacheFile: fsOperation(cacheFile),
		firstInit: justInstalled,
		ctx: await PluginContext.generate(pluginId, JSON.stringify(pluginJson)),
	});
}
