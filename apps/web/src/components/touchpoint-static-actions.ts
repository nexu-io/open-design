export type TouchpointStaticAction = Readonly<{
	id: string;
	target: { kind: "https"; url: string } | { kind: "internal"; path: string };
}>;

/** The server decision must exactly match the verified v2 placement declaration. */
export function touchpointStaticActionsMatch(
	actual: readonly TouchpointStaticAction[],
	expected: readonly TouchpointStaticAction[],
): boolean {
	return (
		actual.length === expected.length &&
		actual.every((action, index) => {
			const declared = expected[index];
			if (
				!declared ||
				action.id !== declared.id ||
				action.target.kind !== declared.target.kind
			)
				return false;
			return action.target.kind === "https" && declared.target.kind === "https"
				? action.target.url === declared.target.url
				: action.target.kind === "internal" &&
						declared.target.kind === "internal" &&
						action.target.path === declared.target.path;
		})
	);
}
