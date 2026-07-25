<script lang="ts">
	import AccessToken from './AccessToken.svelte'
	import RepoInput from './RepoInput.svelte'

	export let owner: string
	export let repo: string
	export let on_submit: () => void
</script>

<nav>
	<span class="logo">
		<h1>Starchart</h1>
	</span>
	<div class="repo-input first">
		<RepoInput bind:owner bind:repo {on_submit} />
	</div>
	<div class="menu">
		<AccessToken />
		<a href="https://github.com/kasper9n/starchart" aria-label="GitHub repository">
			<svg
				height="24"
				viewBox="-2 -2 28 28"
				width="24"
				xmlns="http://www.w3.org/2000/svg"
				class="svelte-8lfi33"
				><path
					d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"
					fill="none"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					class="svelte-8lfi33"
				/></svg
			>
		</a>
	</div>
	<div class="repo-input second">
		<RepoInput bind:owner bind:repo {on_submit} />
	</div>
</nav>

<style lang="sass">
	h1
		margin: 0px
	nav
		display: grid
		padding-top: 20px
		padding-bottom: 14px
		grid-template-areas: "left right" "mid mid"
		grid-template-columns: 1fr 1fr
		.repo-input.first
			display: none
		.repo-input.second
			margin-top: 20px
		@media (min-width: 896px)
			display: grid
			grid-template-areas: "left mid right"
			grid-template-columns: 192px 1fr 192px
			gap: 10px
			.repo-input.first
				display: flex
			.repo-input.second
				display: none
	.logo
		display: flex
		grid-area: left
	.repo-input
		grid-area: mid
	.menu
		display: flex
		align-items: center
		grid-area: right
		justify-content: right
		a
			color: #ffffff
			cursor: default
			margin-left: 0.5rem
		svg
			vertical-align: middle
</style>
