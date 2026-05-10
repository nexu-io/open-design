import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Icon } from "../../src/components/Icon";

function McpJsonHelper() {
	const [showMcpExample, setShowMcpExample] = useState(false);

	return (
		<div className={`mcp-json-helper ${showMcpExample ? "is-open" : ""}`}>
			<button
				type="button"
				className="mcp-json-helper-toggle"
				aria-expanded={showMcpExample}
				aria-controls="mcp-json-helper-panel"
				onClick={() => setShowMcpExample((prev) => !prev)}
			>
				<span className="mcp-json-helper-toggle-content">
					<span className="mcp-json-helper-eye">
						<Icon name="eye" />
					</span>
					<span className="mcp-json-helper-toggle-text">
						Need help? Map your MCP server's JSON config using the example
						below.
					</span>
				</span>
				<span className="mcp-json-helper-toggle-icon">
					{showMcpExample ? (
						<Icon name="arrow-up" />
					) : (
						<Icon name="chevron-down" />
					)}
				</span>
			</button>

			{showMcpExample && (
				<div className="mcp-json-helper-example" id="mcp-json-helper-panel">
					<div className="mcp-json-helper-example-head">Example MCP JSON</div>
					<div className="mcp-json-helper-conversion">
						<div>
							<strong>Command</strong>
							<code>npx</code>
						</div>
						<div>
							<strong>Args</strong>
							<code>-y tdesign-mcp-server@latest</code>
						</div>
						<div>
							<strong>Env</strong>
							<code>API_KEY = your-key-here</code>
						</div>
						<div>
							<strong>HTTP / SSE</strong>
							<code>use url + headers instead of command / args</code>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function renderHelper() {
	return renderToStaticMarkup(<McpJsonHelper />);
}

describe("McpJsonHelper", () => {
	it("renders collapsed by default with no panel visible", () => {
		const html = renderHelper();
		expect(html).toContain('class="mcp-json-helper "');
		expect(html).not.toContain("mcp-json-helper-example");
		expect(html).not.toContain("Example MCP JSON");
	});

	it("renders the toggle button with correct aria attributes when collapsed", () => {
		const html = renderHelper();
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-controls="mcp-json-helper-panel"');
	});

	it("renders the helper text inside the toggle", () => {
		const html = renderHelper();
		expect(html).toContain(
			"Need help? Map your MCP server&#x27;s JSON config using the example below.",
		);
	});

	it("renders the chevron-down icon when collapsed", () => {
		const html = renderHelper();
		expect(html).toContain("mcp-json-helper-toggle-icon");
		expect(html).not.toContain("arrow-up");
	});
});

describe("McpJsonHelper — open state", () => {
	function McpJsonHelperOpen() {
		const [showMcpExample, setShowMcpExample] = useState(true);
		return (
			<div className={`mcp-json-helper ${showMcpExample ? "is-open" : ""}`}>
				<button
					type="button"
					className="mcp-json-helper-toggle"
					aria-expanded={showMcpExample}
					aria-controls="mcp-json-helper-panel"
					onClick={() => setShowMcpExample((prev) => !prev)}
				>
					<span className="mcp-json-helper-toggle-content">
						<span className="mcp-json-helper-toggle-text">
							Need help? Map your MCP server's JSON config using the example
							below.
						</span>
					</span>
				</button>
				{showMcpExample && (
					<div className="mcp-json-helper-example" id="mcp-json-helper-panel">
						<div className="mcp-json-helper-example-head">Example MCP JSON</div>
						<div className="mcp-json-helper-conversion">
							<div>
								<strong>Command</strong>
								<code>npx</code>
							</div>
							<div>
								<strong>Args</strong>
								<code>-y tdesign-mcp-server@latest</code>
							</div>
							<div>
								<strong>Env</strong>
								<code>API_KEY = your-key-here</code>
							</div>
							<div>
								<strong>HTTP / SSE</strong>
								<code>use url + headers instead of command / args</code>
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}

	function renderOpen() {
		return renderToStaticMarkup(<McpJsonHelperOpen />);
	}

	it("renders with is-open class when expanded", () => {
		expect(renderOpen()).toContain("mcp-json-helper is-open");
	});

	it("renders aria-expanded as true when open", () => {
		expect(renderOpen()).toContain('aria-expanded="true"');
	});

	it("renders the panel with correct id for aria-controls", () => {
		expect(renderOpen()).toContain('id="mcp-json-helper-panel"');
	});

	it("renders Example MCP JSON heading when open", () => {
		expect(renderOpen()).toContain("Example MCP JSON");
	});

	it("renders all four conversion fields when open", () => {
		const html = renderOpen();
		expect(html).toContain("Command");
		expect(html).toContain("npx");
		expect(html).toContain("Args");
		expect(html).toContain("-y tdesign-mcp-server@latest");
		expect(html).toContain("Env");
		expect(html).toContain("API_KEY = your-key-here");
		expect(html).toContain("HTTP / SSE");
		expect(html).toContain("use url + headers instead of command / args");
	});

	it("renders the panel div with mcp-json-helper-example class", () => {
		expect(renderOpen()).toContain('class="mcp-json-helper-example"');
	});
});
