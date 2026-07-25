<script lang="ts">
	import { check_shortcut } from './shortcuts'

	export let owner: string
	export let repo: string
	export let on_submit: () => void
	let repo_element: HTMLInputElement

	$: (owner, parse_owner_field())
	async function parse_owner_field() {
		owner = owner.replace(/^https?:\/\//, '').replace('github.com/', '')
		const slash_index = owner.indexOf('/')
		if (slash_index >= 0) {
			const new_owner = owner.slice(0, slash_index)
			const new_repo = owner.slice(slash_index + 1)
			owner = new_owner
			if (new_repo !== '') {
				repo = new_repo
				repo_element.focus()
			} else {
				repo_element.select()
			}
		}
	}

	function input_keydown(e: KeyboardEvent) {
		if (check_shortcut(e, 'Enter')) {
			on_submit()
		}
	}
</script>

<div class="container">
	<div class="inputs">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="bordered owner"
			type="text"
			bind:value={owner}
			placeholder="kasper9n"
			on:keydown={input_keydown}
			autofocus
		/>
		<div><span class="bordered slash">/</span></div>
		<input
			class="bordered repo"
			type="text"
			bind:this={repo_element}
			bind:value={repo}
			placeholder="cpc"
			on:keydown={input_keydown}
		/>
	</div>
	<button type="button" class="bordered button" on:click={() => on_submit()}>Load</button>
</div>

<style lang="sass">
	.container
		margin: auto
	div
		display: flex
		align-items: center
		flex-direction: column
		justify-content: center
		max-width: 32rem
		flex-direction: row
	.owner
		margin-bottom: 0px
		border-radius: 6px 0px 0px 6px
		&:focus-visible
			z-index: 10
	.slash
		border-left: none
		border-right: none
	input
		width: 100%
	.repo
		border-right: none
		box-shadow: 1px 0 0 0 transparent
		&:focus-visible
			box-shadow: 1px 0 0 0 #cbcaf7
	.inputs
		z-index: 5
		position: relative
	button.bordered
		display: block
		background-color: hsla(243, 100%, 77%, 0.5)
		border-color: #7d7da7
		border-radius: 0px 6px 6px 0px
		&:focus-visible
			border-color: #cbcaf7
</style>
